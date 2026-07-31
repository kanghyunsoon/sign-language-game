import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { WebRtcDataChannelTransport } from "../../../realtime";
import { GAME_SYMBOLS } from "../../../recognition/core/symbols";
import { isCompetitiveRecognitionReady } from "../../../recognition/readiness/recognitionReadiness";
import type { BattleGameTransport } from "./BattleGameTransport";
import type { BattleBodyTransform, BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, IdleRemovalTarget, ServerBattleMessage } from "./battleTransportTypes";
import { boardStateChecksum } from "../sync/BoardStateChecksum";

type PeerCommand = ClientBattleMessage;
interface PlayerState { score: number; combo: number; maxCombo: number; removedCount: number; gameOver: boolean; }
interface PendingIdleRemoval { readonly id: string; readonly targets: readonly IdleRemovalTarget[]; readonly selectedAt: number; readonly executeAt: number; }
interface PersistedAuthority { readonly roomId: string; readonly hostPlayerId: string; readonly playerIds: readonly string[]; readonly sequence: number; readonly startAt?: number; readonly spawnIndex: number; readonly targetIndex: number; readonly idleRemovalIndex?: number; readonly symbolBag?: readonly string[]; readonly lastTargetSymbol?: string | null; readonly sharedTarget: { readonly id: string; readonly symbol: string } | null; readonly pendingIdleRemoval?: PendingIdleRemoval | null; readonly players: readonly [string, PlayerState][]; readonly letters: readonly [string, { readonly playerId: string; readonly symbol: string }][]; readonly boards: readonly [string, readonly BattleBodyTransform[]][]; readonly boardUpdatedAt?: readonly [string, number][]; }
const CLAIM_EFFECT_DURATION_MS = 1_150;
const NEXT_TARGET_DELAY_MS = CLAIM_EFFECT_DURATION_MS;
export const BATTLE_IDLE_REMOVAL_TIMEOUT_MS = 10_000;
export const BATTLE_IDLE_REMOVAL_EFFECT_MS = 1_150;
const AUTHORITY_STORAGE_PREFIX = "sudal:block-battle:authority:";
const BATTLE_TARGET_SYMBOLS = GAME_SYMBOLS.filter(isCompetitiveRecognitionReady);

/** Browser-hosted authority carried only by the room WebRTC DataChannel. */
export class P2pBattleTransport implements BattleGameTransport {
  private readonly delegate: WebRtcDataChannelTransport<PeerCommand, ServerBattleMessage>;
  private readonly players = new Map<string, PlayerState>();
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
  private idleRemovalIndex = 0;
  private symbolBag: string[] = [];
  private lastTargetSymbol: string | null = null;
  private sharedTarget: { readonly id: string; readonly symbol: string } | null = null;
  private targetTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleRemovalTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingIdleRemoval: PendingIdleRemoval | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeCommands: (() => void) | null = null;
  private connectGeneration = 0;
  private restoredAuthority = false;

  constructor(getChannel: () => GameDataChannel | null, private readonly localPlayerId: string) {
    this.delegate = new WebRtcDataChannelTransport(getChannel, isBattleEvent);
  }

  async connect(options: BattleConnectionOptions): Promise<void> {
    const generation = ++this.connectGeneration;
    this.roomId = options.roomId;
    this.matchId = options.roomId;
    this.hostPlayerId = options.hostPlayerId ?? options.playerIds?.[0] ?? this.localPlayerId;
    this.playerIds = [...new Set(options.playerIds ?? [this.hostPlayerId, this.localPlayerId])].slice(0, 2);
    for (const playerId of this.playerIds) if (!this.players.has(playerId)) this.players.set(playerId, freshPlayer());
    await this.delegate.connect(options);
    if (generation !== this.connectGeneration || this.delegate.getConnectionState() !== "CONNECTED") return;
    if (this.isHost()) {
      this.unsubscribeCommands ??= this.delegate.subscribeCommands((message, remoteUserId) => this.handle(message, remoteUserId));
      this.restoreAuthority();
      this.startAuthority();
    } else {
      this.delegate.send({ type: "REQUEST_MATCH_STATE", commandId: crypto.randomUUID(), matchId: this.matchId, occurredAt: Date.now() });
    }
  }
  disconnect(): void { this.persistAuthority(); this.connectGeneration += 1; this.unsubscribeCommands?.(); this.unsubscribeCommands = null; this.clearIdleTimers(); if (this.targetTimer) clearTimeout(this.targetTimer); this.targetTimer = null; if (this.resumeTimer) clearTimeout(this.resumeTimer); this.resumeTimer = null; this.delegate.disconnect(); }
  send(message: ClientBattleMessage): void { if (this.isHost()) this.handle(message, this.localPlayerId); else this.delegate.send(message); }
  subscribe(listener: (message: ServerBattleMessage) => void): () => void { return this.delegate.subscribe(listener); }
  subscribeConnectionState(listener: (state: BattleConnectionState) => void): () => void { return this.delegate.subscribeConnectionState(listener); }
  getConnectionState(): BattleConnectionState { return this.delegate.getConnectionState(); }
  getBufferedAmount(): number { return this.delegate.getBufferedAmount(); }

  private isHost(): boolean { return this.localPlayerId === this.hostPlayerId; }
  private startAuthority(): void {
    if (this.restoredAuthority) {
      // Give the browser that stayed in the match a brief chance to return its
      // observed board view. It is fresher than this refreshed host's storage.
      this.resumeTimer = setTimeout(() => {
        this.resumeTimer = null;
        this.publishMatchState();
      }, 150);
    } else this.publishStart();
    if (!this.sharedTarget && !this.targetTimer) this.scheduleNextTarget(800);
    if (this.pendingIdleRemoval) {
      this.publishIdleRemovalSelection(this.pendingIdleRemoval);
      this.scheduleIdleRemovalExecution(this.pendingIdleRemoval);
    } else this.resetIdleTimer(Math.max(0, this.startAt - Date.now()) + BATTLE_IDLE_REMOVAL_TIMEOUT_MS);
  }
  private publishStart(): void {
    const now = Date.now();
    if (!this.startAt) this.startAt = now + 800;
    this.delegate.publishEvent({ type: "MATCH_STARTED", sequence: ++this.sequence, matchId: this.matchId, roomId: this.roomId, playerIds: this.playerIds, startAt: this.startAt, serverTime: now });
    for (const [playerId, bodies] of this.boards) this.delegate.publishSnapshot({ type: "BOARD_SNAPSHOT", sequence: ++this.sequence, matchId: this.matchId, playerId, sentAt: now, bodies, boardChecksum: boardStateChecksum(bodies) });
  }
  private publishMatchState(): void {
    const now = Date.now();
    if (this.startAt > now && !this.sharedTarget) { this.publishStart(); return; }
    this.delegate.publishEvent({ type: "MATCH_STARTED", sequence: ++this.sequence, matchId: this.matchId, roomId: this.roomId, playerIds: this.playerIds, startAt: now, serverTime: now, resume: true, playerStates: [...this.players.entries()].map(([playerId, state]) => ({ playerId, ...state })), ...(this.sharedTarget ? { sharedTarget: { targetId: this.sharedTarget.id, symbol: this.sharedTarget.symbol, presentedAt: now } } : {}) });
    for (const [playerId, bodies] of this.boards) this.delegate.publishSnapshot({ type: "BOARD_SNAPSHOT", sequence: ++this.sequence, matchId: this.matchId, playerId, sentAt: now, bodies, boardChecksum: boardStateChecksum(bodies) });
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
    state.combo += 1;
    state.maxCombo = Math.max(state.maxCombo, state.combo);
    state.removedCount += 1;
    state.score += 100 + state.combo * 10;
    const acceptedAt = Date.now();
    this.delegate.publishEvent({ type: "SHARED_TARGET_CLAIMED", sequence: ++this.sequence, matchId: this.matchId, targetId: target.id, winnerPlayerId: playerId, symbol: target.symbol, score: state.score, combo: state.combo, maxCombo: state.maxCombo, removedCount: state.removedCount, acceptedAt });
    const letterId = `${this.matchId}-${playerId}-${this.spawnIndex}`;
    this.letters.set(letterId, { playerId, symbol: target.symbol });
    this.delegate.publishEvent({ type: "SPAWN_LETTER", sequence: ++this.sequence, matchId: this.matchId, playerId, letterId, spawnIndex: this.spawnIndex++, symbol: target.symbol, spawnAt: acceptedAt + CLAIM_EFFECT_DURATION_MS, normalizedX: .5, normalizedY: .13, initialAngle: 0 });
    this.scheduleNextTarget(NEXT_TARGET_DELAY_MS);
    this.resetIdleTimer();
    this.persistAuthority();
  }
  private handle(message: ClientBattleMessage, playerId: string): void {
    if (!this.isHost() || !(this.playerIds as readonly string[]).includes(playerId) || ("matchId" in message && message.matchId !== this.matchId)) return;
    if ("commandId" in message) { if (this.processed.has(message.commandId)) return; this.processed.add(message.commandId); }
    if (message.type === "REQUEST_MATCH_STATE" || message.type === "PLAYER_RECONNECTED") {
      this.publishMatchState();
      if (this.sharedTarget) this.delegate.publishEvent({ type: "SHARED_TARGET", sequence: ++this.sequence, matchId: this.matchId, targetId: this.sharedTarget.id, symbol: this.sharedTarget.symbol, presentedAt: Date.now() });
      else this.scheduleNextTarget();
      if (this.pendingIdleRemoval) this.publishIdleRemovalSelection(this.pendingIdleRemoval);
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
    state.combo += 1; state.maxCombo = Math.max(state.maxCombo, state.combo); state.removedCount += 1; state.score += 100 + state.combo * 10;
    this.delegate.publishEvent({ type: "REMOVE_LETTER_ACCEPTED", sequence: ++this.sequence, commandId: message.commandId, playerId, letterId: message.letterId, symbol: message.symbol, score: state.score, combo: state.combo, maxCombo: state.maxCombo, removedCount: state.removedCount, acceptedAt: Date.now() });
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
    if (this.targetTimer) clearTimeout(this.targetTimer); this.targetTimer = null; this.sharedTarget = null; this.clearIdleTimers(); this.pendingIdleRemoval = null;
    this.clearPersistedAuthority();
    this.delegate.publishEvent({ type: "MATCH_FINISHED", sequence: ++this.sequence, matchId: this.matchId, winnerPlayerId, loserPlayerId, reason, finishedAt: Date.now(), results: this.playerIds.map((id) => { const state = this.players.get(id)!; return { playerId: id, score: state.score, maxCombo: state.maxCombo, removedCount: state.removedCount, attackCount: 0 }; }) });
  }
  private storageKey(): string { return `${AUTHORITY_STORAGE_PREFIX}${this.localPlayerId}:${this.roomId}`; }
  private persistAuthority(): void {
    if (!this.isHost() || !this.roomId || typeof window === "undefined") return;
    const value: PersistedAuthority = { roomId: this.roomId, hostPlayerId: this.hostPlayerId, playerIds: this.playerIds, sequence: this.sequence, startAt: this.startAt, spawnIndex: this.spawnIndex, targetIndex: this.targetIndex, idleRemovalIndex: this.idleRemovalIndex, symbolBag: this.symbolBag, lastTargetSymbol: this.lastTargetSymbol, sharedTarget: this.sharedTarget, pendingIdleRemoval: this.pendingIdleRemoval, players: [...this.players.entries()], letters: [...this.letters.entries()], boards: [...this.boards.entries()], boardUpdatedAt: [...this.boardUpdatedAt.entries()] };
    try { window.sessionStorage.setItem(this.storageKey(), JSON.stringify(value)); } catch { /* Storage is optional; a connected peer can still resync. */ }
  }
  private restoreAuthority(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(this.storageKey()); if (!raw) return;
      const saved = JSON.parse(raw) as PersistedAuthority;
      if (saved.roomId !== this.roomId || saved.hostPlayerId !== this.hostPlayerId || saved.playerIds.length !== this.playerIds.length || saved.playerIds.some((id) => !this.playerIds.includes(id))) return;
      this.sequence = saved.sequence; this.startAt = saved.startAt ?? Date.now(); this.spawnIndex = saved.spawnIndex; this.targetIndex = saved.targetIndex; this.idleRemovalIndex = saved.idleRemovalIndex ?? 0; this.symbolBag = [...(saved.symbolBag ?? [])]; this.lastTargetSymbol = saved.lastTargetSymbol ?? saved.sharedTarget?.symbol ?? null; this.sharedTarget = saved.sharedTarget; this.pendingIdleRemoval = saved.pendingIdleRemoval ?? null;
      this.players.clear(); for (const [id, state] of saved.players) this.players.set(id, state);
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
  private resetIdleTimer(delay = BATTLE_IDLE_REMOVAL_TIMEOUT_MS): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.pendingIdleRemoval || [...this.players.values()].some((player) => player.gameOver)) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.selectIdleRemoval();
    }, delay);
  }
  private selectIdleRemoval(): void {
    if (this.pendingIdleRemoval || this.playerIds.length !== 2) return;
    const targets = this.playerIds.map((playerId) => this.pickIdleRemovalTarget(playerId));
    if (targets.some((target) => !target)) {
      this.resetIdleTimer();
      return;
    }
    const selectedAt = Date.now();
    const pending: PendingIdleRemoval = {
      id: `${this.matchId}-idle-${this.idleRemovalIndex++}`,
      targets: targets as IdleRemovalTarget[],
      selectedAt,
      executeAt: selectedAt + BATTLE_IDLE_REMOVAL_EFFECT_MS,
    };
    this.pendingIdleRemoval = pending;
    this.publishIdleRemovalSelection(pending);
    this.scheduleIdleRemovalExecution(pending);
    this.persistAuthority();
  }
  private pickIdleRemovalTarget(playerId: string): IdleRemovalTarget | null {
    const board = this.boards.get(playerId) ?? [];
    const active = board.filter((body) => body.state !== "REMOVED" && this.letters.get(body.id)?.playerId === playerId);
    if (!active.length) return null;
    const settled = active.filter((body) => body.state === "SETTLED");
    const candidates = settled.length ? settled : active;
    const body = candidates[Math.floor(Math.random() * candidates.length)]!;
    return { playerId, letterId: body.id, symbol: body.symbol, normalizedX: body.x, normalizedY: body.y };
  }
  private publishIdleRemovalSelection(pending: PendingIdleRemoval): void {
    this.delegate.publishEvent({ type: "IDLE_REMOVAL_SELECTED", sequence: ++this.sequence, matchId: this.matchId, removalId: pending.id, targets: pending.targets, selectedAt: pending.selectedAt, executeAt: pending.executeAt });
  }
  private scheduleIdleRemovalExecution(pending: PendingIdleRemoval): void {
    if (this.idleRemovalTimer) clearTimeout(this.idleRemovalTimer);
    this.idleRemovalTimer = setTimeout(() => {
      this.idleRemovalTimer = null;
      if (this.pendingIdleRemoval?.id !== pending.id) return;
      this.executeIdleRemoval(pending);
    }, Math.max(0, pending.executeAt - Date.now()));
  }
  private executeIdleRemoval(pending: PendingIdleRemoval): void {
    for (const target of pending.targets) {
      this.letters.delete(target.letterId);
      const board = this.boards.get(target.playerId);
      if (board) this.boards.set(target.playerId, board.filter((body) => body.id !== target.letterId));
    }
    this.pendingIdleRemoval = null;
    this.delegate.publishEvent({ type: "IDLE_REMOVAL_EXECUTED", sequence: ++this.sequence, matchId: this.matchId, removalId: pending.id, targets: pending.targets, executedAt: Date.now() });
    this.resetIdleTimer();
    this.persistAuthority();
  }
  private clearIdleTimers(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.idleRemovalTimer) clearTimeout(this.idleRemovalTimer);
    this.idleTimer = null;
    this.idleRemovalTimer = null;
  }
  private clearPersistedAuthority(): void { try { if (typeof window !== "undefined") window.sessionStorage.removeItem(this.storageKey()); } catch { /* no-op */ } }
}
function freshPlayer(): PlayerState { return { score: 0, combo: 0, maxCombo: 0, removedCount: 0, gameOver: false }; }
function isBattleEvent(value: unknown): value is ServerBattleMessage { return !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" && ["START_MATCH", "MATCH_STARTED", "GAME_START", "SHARED_TARGET", "SHARED_TARGET_CLAIMED", "IDLE_REMOVAL_SELECTED", "IDLE_REMOVAL_EXECUTED", "SPAWN_LETTER", "REMOVE_LETTER_ACCEPTED", "REMOVE_LETTER_REJECTED", "SCORE_UPDATED", "COMBO_UPDATED", "ATTACK_CREATED", "ATTACK_APPLIED", "MATCH_FINISHED", "RESULT_RECORDED", "PLAYER_DISCONNECTED", "PLAYER_RECONNECTED", "BODY_TRANSFORM_BATCH", "BOARD_SNAPSHOT", "LETTER_SPAWNED_SYNC", "LETTER_STATE_SYNC", "LETTER_REMOVED_SYNC", "OTTER_TRANSFER"].includes((value as { type: string }).type); }
