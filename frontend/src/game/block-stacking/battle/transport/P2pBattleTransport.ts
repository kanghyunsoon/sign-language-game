import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { WebRtcDataChannelTransport } from "../../../realtime";
import { GAME_SYMBOLS } from "../../../recognition/core/symbols";
import { isCompetitiveRecognitionReady } from "../../../recognition/readiness/recognitionReadiness";
import type { BattleGameTransport } from "./BattleGameTransport";
import type { BattleBodyTransform, BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, ServerBattleMessage } from "./battleTransportTypes";
import { boardStateChecksum } from "../sync/BoardStateChecksum";

type PeerCommand = ClientBattleMessage;
interface PlayerState { score: number; combo: number; maxCombo: number; removedCount: number; attackCount: number; gameOver: boolean; }
interface PersistedAuthority { readonly roomId: string; readonly hostPlayerId: string; readonly playerIds: readonly string[]; readonly sequence: number; readonly startAt?: number; readonly spawnIndex: number; readonly targetIndex: number; readonly symbolBag?: readonly string[]; readonly lastTargetSymbol?: string | null; readonly sharedTarget: { readonly id: string; readonly symbol: string } | null; readonly players: readonly [string, PlayerState][]; readonly playerProfiles?: readonly [string, string][]; readonly letters: readonly [string, { readonly playerId: string; readonly symbol: string }][]; readonly boards: readonly [string, readonly BattleBodyTransform[]][]; readonly boardUpdatedAt?: readonly [string, number][]; }
const CLAIM_EFFECT_DURATION_MS = 1_150;
const NEXT_TARGET_DELAY_MS = CLAIM_EFFECT_DURATION_MS;
const MATCH_COUNTDOWN_MS = 3_000;
const HAMMER_COMBO_TARGET = 3;
const HAMMER_IMPACT_DELAY_MS = 760;
const HAMMER_TRANSFER_DELAY_MS = 1_650;
const RECONNECT_SNAPSHOT_SETTLE_MS = 240;
const AUTHORITY_STORAGE_PREFIX = "sudal:block-battle:authority:";
const BATTLE_TARGET_SYMBOLS = GAME_SYMBOLS.filter(isCompetitiveRecognitionReady);

/** Browser-hosted authority carried only by the room WebRTC DataChannel. */
export class P2pBattleTransport implements BattleGameTransport {
  private readonly delegate: WebRtcDataChannelTransport<PeerCommand, ServerBattleMessage>;
  private readonly players = new Map<string, PlayerState>();
  private readonly playerProfiles = new Map<string, string>();
  private readonly letters = new Map<string, { playerId: string; symbol: string }>();
  private readonly boards = new Map<string, readonly BattleBodyTransform[]>();
  private readonly boardUpdatedAt = new Map<string, number>();
  private processed = new Set<string>();
  private playerIds: readonly string[] = [];
  private hostPlayerId = "";
  private matchId = "";
  private roomId = "";
  private sequence = 0;
  private startAt = 0;
  private spawnIndex = 0;
  private targetIndex = 0;
  private symbolBag: string[] = [];
  private lastTargetSymbol: string | null = null;
  private sharedTarget: { readonly id: string; readonly symbol: string } | null = null;
  private targetTimer: ReturnType<typeof setTimeout> | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingResumePlayerIds = new Set<string>();
  private unsubscribeCommands: (() => void) | null = null;
  private connectGeneration = 0;
  private hasConnected = false;
  private restoredAuthority = false;

  constructor(getChannel: () => GameDataChannel | null, private readonly localPlayerId: string, private readonly localDisplayName = localPlayerId) {
    this.delegate = new WebRtcDataChannelTransport(getChannel, isBattleEvent);
  }

  async connect(options: BattleConnectionOptions): Promise<void> {
    const generation = ++this.connectGeneration;
    this.roomId = options.roomId;
    this.matchId = options.roomId;
    this.hostPlayerId = options.hostPlayerId ?? options.playerIds?.[0] ?? this.localPlayerId;
    this.playerIds = [...new Set(options.playerIds ?? [this.hostPlayerId, this.localPlayerId])].slice(0, 2);
    for (const playerId of this.playerIds) if (!this.players.has(playerId)) this.players.set(playerId, freshPlayer());
    this.playerProfiles.set(this.localPlayerId, normalizeDisplayName(this.localDisplayName, this.localPlayerId));
    await this.delegate.connect(options);
    if (generation !== this.connectGeneration || this.delegate.getConnectionState() !== "CONNECTED") return;
    const firstConnection = !this.hasConnected;
    this.hasConnected = true;
    if (this.isHost()) {
      this.unsubscribeCommands ??= this.delegate.subscribeCommands((message, remoteUserId) => this.handle(message, remoteUserId));
      if (firstConnection) {
        this.restoreAuthority();
        // A refreshed host may restore an older profile snapshot. The current
        // signed-in user's display name is authoritative for this browser.
        this.playerProfiles.set(this.localPlayerId, normalizeDisplayName(this.localDisplayName, this.localPlayerId));
        this.startAuthority();
      } else {
        // Reopening the data channel on the surviving host must not restart or
        // rewind the match. The refreshed peer will request its own snapshot.
        this.publishKnownProfiles();
      }
    } else {
      // A newly mounted page needs hydration. A channel reconnect on the same
      // mounted page keeps its owner-authoritative Matter.js board running.
      if (firstConnection) this.delegate.send({ type: "REQUEST_MATCH_STATE", commandId: crypto.randomUUID(), matchId: this.matchId, occurredAt: Date.now() });
      this.delegate.send({ type: "PLAYER_PROFILE_COMMAND", commandId: crypto.randomUUID(), matchId: this.matchId, playerId: this.localPlayerId, displayName: normalizeDisplayName(this.localDisplayName, this.localPlayerId), occurredAt: Date.now() });
    }
  }
  disconnect(): void { this.persistAuthority(); this.connectGeneration += 1; this.unsubscribeCommands?.(); this.unsubscribeCommands = null; if (this.targetTimer) clearTimeout(this.targetTimer); this.targetTimer = null; if (this.resumeTimer) clearTimeout(this.resumeTimer); this.resumeTimer = null; this.pendingResumePlayerIds.clear(); this.delegate.disconnect(); }
  send(message: ClientBattleMessage): void { if (this.isHost()) this.handle(message, this.localPlayerId); else this.delegate.send(message); }
  subscribe(listener: (message: ServerBattleMessage) => void): () => void { return this.delegate.subscribe(listener); }
  subscribeConnectionState(listener: (state: BattleConnectionState) => void): () => void { return this.delegate.subscribeConnectionState(listener); }
  getConnectionState(): BattleConnectionState { return this.delegate.getConnectionState(); }
  getBufferedAmount(): number { return this.delegate.getBufferedAmount(); }

  private isHost(): boolean { return this.localPlayerId === this.hostPlayerId; }
  private startAuthority(): void {
    if (this.restoredAuthority) {
      // Give the browser that stayed in the match a chance to return its live
      // view of the refreshed host's falling bodies before hydration begins.
      this.queueMatchState(this.localPlayerId);
    } else this.publishStart();
    if (!this.sharedTarget && !this.targetTimer) {
      const delayUntilStart = Math.max(0, this.startAt - Date.now());
      this.scheduleNextTarget(delayUntilStart > 0 ? delayUntilStart : 320);
    }
  }
  private publishStart(): void {
    const now = Date.now();
    if (!this.startAt) this.startAt = now + MATCH_COUNTDOWN_MS;
    this.delegate.publishEvent({ type: "MATCH_STARTED", sequence: ++this.sequence, matchId: this.matchId, roomId: this.roomId, playerIds: this.playerIds, startAt: this.startAt, serverTime: now });
    this.publishKnownProfiles();
    for (const [playerId, bodies] of this.boards) this.delegate.publishSnapshot({ type: "BOARD_SNAPSHOT", sequence: ++this.sequence, matchId: this.matchId, playerId, sentAt: now, bodies, boardChecksum: boardStateChecksum(bodies) });
  }
  private queueMatchState(playerId: string): void {
    this.pendingResumePlayerIds.add(playerId);
    if (this.resumeTimer) return;
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      const recipients = [...this.pendingResumePlayerIds];
      this.pendingResumePlayerIds.clear();
      for (const recipientPlayerId of recipients) this.publishMatchState(recipientPlayerId);
    }, RECONNECT_SNAPSHOT_SETTLE_MS);
  }
  private publishMatchState(recipientPlayerId: string): void {
    const now = Date.now();
    if (this.startAt > now && !this.sharedTarget) { this.publishStart(); return; }
    this.delegate.publishEvent({ type: "MATCH_STARTED", sequence: ++this.sequence, matchId: this.matchId, roomId: this.roomId, playerIds: this.playerIds, startAt: now, serverTime: now, resume: true, resumePlayerId: recipientPlayerId, playerStates: [...this.players.entries()].map(([playerId, state]) => ({ playerId, ...state })), ...(this.sharedTarget ? { sharedTarget: { targetId: this.sharedTarget.id, symbol: this.sharedTarget.symbol, presentedAt: now } } : {}) });
    this.publishKnownProfiles();
    // Always publish both fields, including an empty field. The reconnecting
    // browser must know that hydration is complete before Matter.js resumes.
    for (const playerId of this.playerIds) {
      const bodies = this.boards.get(playerId) ?? [];
      this.delegate.publishSnapshot({ type: "BOARD_SNAPSHOT", sequence: ++this.sequence, matchId: this.matchId, playerId, sentAt: now, bodies, boardChecksum: boardStateChecksum(bodies), restoreForPlayerId: recipientPlayerId });
    }
  }
  private scheduleNextTarget(delay = 320): void {
    if (this.targetTimer || [...this.players.values()].some((player) => player.gameOver)) return;
    this.targetTimer = setTimeout(() => {
      this.targetTimer = null;
      this.publishNextTarget();
    }, delay);
  }
  private publishNextTarget(): void {
    if (this.playerIds.length !== 2 || this.sharedTarget || [...this.players.values()].some((player) => player.gameOver)) return;
    const symbol = this.takeRandomSymbol();
    const targetId = `${this.matchId}-target-${this.targetIndex}`;
    this.targetIndex += 1;
    this.sharedTarget = { id: targetId, symbol };
    this.persistAuthority();
    this.delegate.publishEvent({ type: "SHARED_TARGET", sequence: ++this.sequence, matchId: this.matchId, targetId, symbol, presentedAt: Date.now() });
  }
  private claimTarget(message: Extract<ClientBattleMessage, { type: "CLAIM_SHARED_TARGET" }>, playerId: string): void {
    const target = this.sharedTarget;
    if (!target || target.id !== message.targetId || target.symbol !== message.symbol) return;
    this.sharedTarget = null;
    const state = this.players.get(playerId);
    if (!state || state.gameOver) return;
    const combo = this.updateCombo(playerId);
    state.removedCount += 1;
    state.score += 100 + combo.streak * 10;
    const acceptedAt = Date.now();
    this.delegate.publishEvent({ type: "SHARED_TARGET_CLAIMED", sequence: ++this.sequence, matchId: this.matchId, targetId: target.id, winnerPlayerId: playerId, symbol: target.symbol, score: state.score, combo: combo.current, maxCombo: state.maxCombo, removedCount: state.removedCount, acceptedAt });
    const letterId = `${this.matchId}-${playerId}-${this.spawnIndex}`;
    this.letters.set(letterId, { playerId, symbol: target.symbol });
    this.delegate.publishEvent({ type: "SPAWN_LETTER", sequence: ++this.sequence, matchId: this.matchId, playerId, letterId, spawnIndex: this.spawnIndex++, symbol: target.symbol, spawnAt: acceptedAt + CLAIM_EFFECT_DURATION_MS, normalizedX: .5, normalizedY: .13, initialAngle: 0 });
    if (combo.attackReady && combo.victim) this.triggerHammerAttack(playerId, acceptedAt, combo.victim);
    this.scheduleNextTarget(NEXT_TARGET_DELAY_MS);
    this.persistAuthority();
  }
  private handle(message: ClientBattleMessage, playerId: string): void {
    if (!this.isHost() || !(this.playerIds as readonly string[]).includes(playerId) || ("matchId" in message && message.matchId !== this.matchId)) return;
    if ("commandId" in message) { if (this.processed.has(message.commandId)) return; this.processed.add(message.commandId); }
    if (message.type === "PLAYER_PROFILE_COMMAND") {
      if (message.playerId !== playerId) return;
      const displayName = normalizeDisplayName(message.displayName, playerId);
      this.playerProfiles.set(playerId, displayName);
      this.delegate.publishEvent({ type: "PLAYER_PROFILE_UPDATED", sequence: ++this.sequence, playerId, displayName });
      this.publishKnownProfiles();
      this.persistAuthority();
      return;
    }
    if (message.type === "REQUEST_MATCH_STATE" || message.type === "PLAYER_RECONNECTED") {
      // Wait briefly so the player who stayed connected can submit its latest
      // interpolated view, especially while a letter is still falling.
      this.queueMatchState(playerId);
      if (!this.sharedTarget) this.scheduleNextTarget();
      return;
    }
    // A board owner is the only physics authority for that board. Relay its
    // latest compact transform sample; the opponent interpolates it instead
    // of running a divergent second Matter.js world.
    if (message.type === "BODY_TRANSFORM_BATCH") {
      if (message.playerId !== playerId) return;
      const relay = { ...message, sequence: ++this.sequence };
      if (playerId === this.localPlayerId) this.delegate.sendSnapshot(relay);
      else this.delegate.publishLocal(relay);
      return;
    }
    if (message.type === "BOARD_SNAPSHOT") {
      if (message.playerId !== playerId) return;
      this.boards.set(playerId, message.bodies);
      this.boardUpdatedAt.set(playerId, message.sentAt);
      this.persistAuthority();
      const relay = { ...message, sequence: ++this.sequence };
      if (playerId === this.localPlayerId) this.delegate.sendSnapshot(relay);
      else this.delegate.publishLocal(relay);
      return;
    }
    if (message.type === "PEER_BOARD_VIEW") {
      if (message.observerPlayerId !== playerId || message.subjectPlayerId === playerId || !this.playerIds.includes(message.subjectPlayerId)) return;
      if (message.sentAt <= (this.boardUpdatedAt.get(message.subjectPlayerId) ?? Number.NEGATIVE_INFINITY)) return;
      this.boards.set(message.subjectPlayerId, message.bodies);
      this.boardUpdatedAt.set(message.subjectPlayerId, message.sentAt);
      this.persistAuthority();
      this.delegate.publishSnapshot({ type: "BOARD_SNAPSHOT", sequence: ++this.sequence, matchId: this.matchId, playerId: message.subjectPlayerId, sentAt: message.sentAt, bodies: message.bodies, boardChecksum: boardStateChecksum(message.bodies) });
      return;
    }
    if (message.type === "CLAIM_SHARED_TARGET") { this.claimTarget(message, playerId); return; }
    // Kept as a no-op for wire compatibility with an older client. A combo is
    // now a consecutive round-win streak, so ambiguous signs never reset it.
    if (message.type === "RESET_COMBO_COMMAND") return;
    if (message.type === "RESULT_RECORDED_COMMAND") {
      if (playerId !== this.hostPlayerId) return;
      this.delegate.publishEvent({ type: "RESULT_RECORDED", sequence: ++this.sequence, matchId: this.matchId, recordedAt: message.recordedAt });
      return;
    }
    if (message.type === "REMOVE_LETTER_COMMAND") { this.remove(message, playerId); return; }
    // The line is the finish line: the player whose settled tower reaches it
    // wins. The legacy command name is retained for wire compatibility.
    if (message.type === "PLAYER_GAME_OVER_COMMAND") this.finish(playerId, "DANGER_LINE");
    if (message.type === "PLAYER_FORFEIT_COMMAND") this.finish(playerId, "FORFEIT");
  }
  private remove(message: Extract<ClientBattleMessage, { type: "REMOVE_LETTER_COMMAND" }>, playerId: string): void {
    const letter = this.letters.get(message.letterId);
    if (!letter || letter.playerId !== playerId || letter.symbol !== message.symbol) {
      this.delegate.publishEvent({ type: "REMOVE_LETTER_REJECTED", sequence: ++this.sequence, commandId: message.commandId, letterId: message.letterId, code: "INVALID_TARGET", message: "선택한 지문자 블록이 현재 대상과 일치하지 않습니다.", rejectedAt: Date.now() });
      return;
    }
    this.letters.delete(message.letterId);
    const state = this.players.get(playerId)!;
    const acceptedAt = Date.now();
    const combo = this.updateCombo(playerId);
    state.removedCount += 1; state.score += 100 + combo.streak * 10;
    this.delegate.publishEvent({ type: "REMOVE_LETTER_ACCEPTED", sequence: ++this.sequence, commandId: message.commandId, playerId, letterId: message.letterId, symbol: message.symbol, score: state.score, combo: combo.current, maxCombo: state.maxCombo, removedCount: state.removedCount, acceptedAt });
    if (combo.attackReady && combo.victim) this.triggerHammerAttack(playerId, acceptedAt, combo.victim);
    this.persistAuthority();
  }
  private finish(reportedPlayerId: string, reason: "DANGER_LINE" | "FORFEIT"): void {
    const winnerPlayerId = reason === "DANGER_LINE"
      ? reportedPlayerId
      : this.playerIds.find((id) => id !== reportedPlayerId) ?? null;
    const loserPlayerId = reason === "DANGER_LINE"
      ? this.playerIds.find((id) => id !== reportedPlayerId) ?? null
      : reportedPlayerId;
    if (!winnerPlayerId || !loserPlayerId) return;
    const loser = this.players.get(loserPlayerId); if (!loser || loser.gameOver) return; loser.gameOver = true;
    if (this.targetTimer) clearTimeout(this.targetTimer); this.targetTimer = null; this.sharedTarget = null;
    this.clearPersistedAuthority();
    this.delegate.publishEvent({ type: "MATCH_FINISHED", sequence: ++this.sequence, matchId: this.matchId, winnerPlayerId, loserPlayerId, reason, finishedAt: Date.now(), results: this.playerIds.map((id) => { const state = this.players.get(id)!; return { playerId: id, score: state.score, maxCombo: state.maxCombo, removedCount: state.removedCount, attackCount: state.attackCount }; }) });
  }
  private storageKey(): string { return `${AUTHORITY_STORAGE_PREFIX}${this.localPlayerId}:${this.roomId}`; }
  private persistAuthority(): void {
    if (!this.isHost() || !this.roomId || typeof window === "undefined") return;
    const value: PersistedAuthority = { roomId: this.roomId, hostPlayerId: this.hostPlayerId, playerIds: this.playerIds, sequence: this.sequence, startAt: this.startAt, spawnIndex: this.spawnIndex, targetIndex: this.targetIndex, symbolBag: this.symbolBag, lastTargetSymbol: this.lastTargetSymbol, sharedTarget: this.sharedTarget, players: [...this.players.entries()], playerProfiles: [...this.playerProfiles.entries()], letters: [...this.letters.entries()], boards: [...this.boards.entries()], boardUpdatedAt: [...this.boardUpdatedAt.entries()] };
    try { window.sessionStorage.setItem(this.storageKey(), JSON.stringify(value)); } catch { /* Storage is optional; a connected peer can still resync. */ }
  }
  private restoreAuthority(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(this.storageKey()); if (!raw) return;
      const saved = JSON.parse(raw) as PersistedAuthority;
      if (saved.roomId !== this.roomId || saved.hostPlayerId !== this.hostPlayerId || saved.playerIds.length !== this.playerIds.length || saved.playerIds.some((id) => !this.playerIds.includes(id))) return;
      this.sequence = saved.sequence; this.startAt = saved.startAt ?? Date.now(); this.spawnIndex = saved.spawnIndex; this.targetIndex = saved.targetIndex; this.symbolBag = [...(saved.symbolBag ?? [])]; this.lastTargetSymbol = saved.lastTargetSymbol ?? saved.sharedTarget?.symbol ?? null; this.sharedTarget = saved.sharedTarget;
      this.players.clear(); for (const [id, state] of saved.players) this.players.set(id, { ...state, attackCount: state.attackCount ?? 0 });
      for (const [id, displayName] of saved.playerProfiles ?? []) this.playerProfiles.set(id, displayName);
      this.letters.clear(); for (const [id, letter] of saved.letters) this.letters.set(id, letter);
      this.boards.clear(); for (const [id, bodies] of saved.boards) this.boards.set(id, bodies);
      this.boardUpdatedAt.clear(); for (const [id, updatedAt] of saved.boardUpdatedAt ?? []) this.boardUpdatedAt.set(id, updatedAt);
      this.restoredAuthority = true;
    } catch { this.clearPersistedAuthority(); }
  }
  private takeRandomSymbol(): string {
    if (this.symbolBag.length === 0) {
      this.symbolBag = [...BATTLE_TARGET_SYMBOLS];
      for (let index = this.symbolBag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [this.symbolBag[index], this.symbolBag[swapIndex]] = [this.symbolBag[swapIndex]!, this.symbolBag[index]!];
      }
      if (this.symbolBag.length > 1 && this.symbolBag[0] === this.lastTargetSymbol) {
        [this.symbolBag[0], this.symbolBag[1]] = [this.symbolBag[1]!, this.symbolBag[0]!];
      }
    }
    const symbol = this.symbolBag.shift() ?? BATTLE_TARGET_SYMBOLS[0]!;
    this.lastTargetSymbol = symbol;
    return symbol;
  }
  private updateCombo(playerId: string): { readonly current: number; readonly streak: number; readonly attackReady: boolean; readonly victim: BattleBodyTransform | null } {
    const state = this.players.get(playerId);
    if (!state) return { current: 0, streak: 0, attackReady: false, victim: null };
    const opponentId = this.playerIds.find((id) => id !== playerId);
    if (opponentId) {
      const opponent = this.players.get(opponentId);
      if (opponent && opponent.combo > 0) {
        opponent.combo = 0;
        this.delegate.publishEvent({ type: "COMBO_UPDATED", sequence: ++this.sequence, playerId: opponentId, combo: 0, maxCombo: opponent.maxCombo, reason: "OPPONENT_CORRECT" });
      }
    }
    const streak = state.combo + 1;
    state.maxCombo = Math.max(state.maxCombo, streak);
    const completedStreak = streak >= HAMMER_COMBO_TARGET;
    const victim = completedStreak && opponentId ? this.pickVictimBlock(opponentId) : null;
    const attackReady = victim !== null;
    state.combo = completedStreak ? 0 : streak;
    this.delegate.publishEvent({
      type: "COMBO_UPDATED",
      sequence: ++this.sequence,
      playerId,
      combo: state.combo,
      maxCombo: state.maxCombo,
      ...(attackReady ? { reason: "HAMMER_TRIGGERED" as const } : !completedStreak ? { reason: "CORRECT" as const } : {}),
    });
    return { current: state.combo, streak, attackReady, victim };
  }
  private triggerHammerAttack(attackerPlayerId: string, createdAt: number, victim: BattleBodyTransform): void {
    const defenderPlayerId = this.playerIds.find((id) => id !== attackerPlayerId);
    if (!defenderPlayerId) return;
    const transfer = this.transferBlockToAttacker(attackerPlayerId, defenderPlayerId, victim);
    const state = this.players.get(attackerPlayerId);
    if (state) state.attackCount += 1;
    this.delegate.publishEvent({
      type: "HAMMER_ATTACK",
      sequence: ++this.sequence,
      matchId: this.matchId,
      attackId: `${this.matchId}-hammer-${createdAt}-${attackerPlayerId}`,
      attackerPlayerId,
      defenderPlayerId,
      sourceCombo: 3,
      ...transfer,
      createdAt,
      impactAt: createdAt + HAMMER_IMPACT_DELAY_MS,
      spawnAt: createdAt + HAMMER_TRANSFER_DELAY_MS,
    });
  }
  private publishKnownProfiles(): void {
    for (const [playerId, displayName] of this.playerProfiles) {
      this.delegate.publishEvent({ type: "PLAYER_PROFILE_UPDATED", sequence: ++this.sequence, playerId, displayName });
    }
  }
  private pickVictimBlock(defenderPlayerId: string): BattleBodyTransform | null {
    const candidates = (this.boards.get(defenderPlayerId) ?? []).filter((body) => body.state !== "REMOVED" && this.letters.get(body.id)?.playerId === defenderPlayerId);
    if (!candidates.length) return null;
    const bottomY = Math.max(...candidates.map((body) => body.y));
    const bottomCandidates = candidates.filter((body) => bottomY - body.y <= .025);
    return bottomCandidates[Math.floor(Math.random() * bottomCandidates.length)] ?? null;
  }
  private transferBlockToAttacker(attackerPlayerId: string, defenderPlayerId: string, victim: BattleBodyTransform): { readonly victimLetterId: string; readonly transferredLetterId: string; readonly symbol: string; readonly sourceNormalizedX: number; readonly sourceNormalizedY: number } {
    const transferredLetterId = `${this.matchId}-${attackerPlayerId}-hammer-${this.spawnIndex++}`;
    this.letters.delete(victim.id);
    this.letters.set(transferredLetterId, { playerId: attackerPlayerId, symbol: victim.symbol });
    const defenderBoard = this.boards.get(defenderPlayerId);
    if (defenderBoard) this.boards.set(defenderPlayerId, defenderBoard.filter((body) => body.id !== victim.id));
    return { victimLetterId: victim.id, transferredLetterId, symbol: victim.symbol, sourceNormalizedX: victim.x, sourceNormalizedY: victim.y };
  }
  private clearPersistedAuthority(): void { try { if (typeof window !== "undefined") window.sessionStorage.removeItem(this.storageKey()); } catch { /* no-op */ } }
}
function freshPlayer(): PlayerState { return { score: 0, combo: 0, maxCombo: 0, removedCount: 0, attackCount: 0, gameOver: false }; }
function normalizeDisplayName(value: string, fallback: string): string {
  const normalized = value.trim().slice(0, 24);
  return normalized || fallback;
}
function isBattleEvent(value: unknown): value is ServerBattleMessage { return !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" && ["START_MATCH", "MATCH_STARTED", "GAME_START", "SHARED_TARGET", "SHARED_TARGET_CLAIMED", "SPAWN_LETTER", "REMOVE_LETTER_ACCEPTED", "REMOVE_LETTER_REJECTED", "SCORE_UPDATED", "COMBO_UPDATED", "PLAYER_PROFILE_UPDATED", "ATTACK_CREATED", "ATTACK_APPLIED", "HAMMER_ATTACK", "MATCH_FINISHED", "RESULT_RECORDED", "PLAYER_DISCONNECTED", "PLAYER_RECONNECTED", "BODY_TRANSFORM_BATCH", "BOARD_SNAPSHOT", "LETTER_SPAWNED_SYNC", "LETTER_STATE_SYNC", "LETTER_REMOVED_SYNC", "OTTER_TRANSFER"].includes((value as { type: string }).type); }
