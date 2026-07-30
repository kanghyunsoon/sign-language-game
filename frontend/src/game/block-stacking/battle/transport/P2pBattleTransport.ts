import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { WebRtcDataChannelTransport } from "../../../realtime";
import type { BattleGameTransport } from "./BattleGameTransport";
import type { BattleBodyTransform, BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, ServerBattleMessage } from "./battleTransportTypes";

type PeerCommand = ClientBattleMessage;
interface PlayerState { score: number; combo: number; maxCombo: number; removedCount: number; gameOver: boolean; }
interface PersistedAuthority { readonly roomId: string; readonly hostPlayerId: string; readonly playerIds: readonly string[]; readonly sequence: number; readonly startAt?: number; readonly spawnIndex: number; readonly targetIndex: number; readonly sharedTarget: { readonly id: string; readonly symbol: string } | null; readonly players: readonly [string, PlayerState][]; readonly letters: readonly [string, { readonly playerId: string; readonly symbol: string }][]; readonly boards: readonly [string, readonly BattleBodyTransform[]][]; }
const CLAIM_EFFECT_DURATION_MS = 1_150;
const NEXT_TARGET_DELAY_MS = 2_300;
const AUTHORITY_STORAGE_PREFIX = "sudal:block-battle:authority:";

/** Browser-hosted authority carried only by the room WebRTC DataChannel. */
export class P2pBattleTransport implements BattleGameTransport {
  private readonly delegate: WebRtcDataChannelTransport<PeerCommand, ServerBattleMessage>;
  private readonly players = new Map<string, PlayerState>();
  private readonly letters = new Map<string, { playerId: string; symbol: string }>();
  private readonly boards = new Map<string, readonly BattleBodyTransform[]>();
  private processed = new Set<string>();
  private playerIds: readonly string[] = [];
  private hostPlayerId = "";
  private matchId = "";
  private roomId = "";
  private sequence = 0;
  private startAt = 0;
  private spawnIndex = 0;
  private targetIndex = 0;
  private sharedTarget: { readonly id: string; readonly symbol: string } | null = null;
  private targetTimer: ReturnType<typeof setTimeout> | null = null;
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
  disconnect(): void { this.persistAuthority(); this.connectGeneration += 1; this.unsubscribeCommands?.(); this.unsubscribeCommands = null; if (this.targetTimer) clearTimeout(this.targetTimer); this.targetTimer = null; this.delegate.disconnect(); }
  send(message: ClientBattleMessage): void { if (this.isHost()) this.handle(message, this.localPlayerId); else this.delegate.send(message); }
  subscribe(listener: (message: ServerBattleMessage) => void): () => void { return this.delegate.subscribe(listener); }
  subscribeConnectionState(listener: (state: BattleConnectionState) => void): () => void { return this.delegate.subscribeConnectionState(listener); }
  getConnectionState(): BattleConnectionState { return this.delegate.getConnectionState(); }

  private isHost(): boolean { return this.localPlayerId === this.hostPlayerId; }
  private startAuthority(): void {
    if (this.restoredAuthority) this.publishMatchState();
    else this.publishStart();
    if (this.sharedTarget || this.targetTimer) return;
    this.scheduleNextTarget(800);
  }
  private publishStart(): void {
    const now = Date.now();
    if (!this.startAt) this.startAt = now + 800;
    this.delegate.publishEvent({ type: "MATCH_STARTED", sequence: ++this.sequence, matchId: this.matchId, roomId: this.roomId, playerIds: this.playerIds, startAt: this.startAt, serverTime: now });
    for (const [playerId, bodies] of this.boards) this.delegate.publishSnapshot({ type: "BOARD_SNAPSHOT", sequence: ++this.sequence, matchId: this.matchId, playerId, sentAt: now, bodies });
  }
  private publishMatchState(): void {
    const now = Date.now();
    if (this.startAt > now && !this.sharedTarget) { this.publishStart(); return; }
    this.delegate.publishEvent({ type: "MATCH_STARTED", sequence: ++this.sequence, matchId: this.matchId, roomId: this.roomId, playerIds: this.playerIds, startAt: now, serverTime: now, resume: true, playerStates: [...this.players.entries()].map(([playerId, state]) => ({ playerId, ...state })) });
    for (const [playerId, bodies] of this.boards) this.delegate.publishSnapshot({ type: "BOARD_SNAPSHOT", sequence: ++this.sequence, matchId: this.matchId, playerId, sentAt: now, bodies });
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
    const symbol = SYMBOLS[this.targetIndex % SYMBOLS.length];
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
    this.delegate.publishEvent({ type: "SPAWN_LETTER", sequence: ++this.sequence, matchId: this.matchId, playerId, letterId, spawnIndex: this.spawnIndex++, symbol: target.symbol, spawnAt: acceptedAt + CLAIM_EFFECT_DURATION_MS, normalizedX: .5, initialAngle: 0 });
    this.scheduleNextTarget(NEXT_TARGET_DELAY_MS);
    this.persistAuthority();
  }
  private handle(message: ClientBattleMessage, playerId: string): void {
    if (!this.isHost() || !(this.playerIds as readonly string[]).includes(playerId) || ("matchId" in message && message.matchId !== this.matchId)) return;
    if ("commandId" in message) { if (this.processed.has(message.commandId)) return; this.processed.add(message.commandId); }
    if (message.type === "REQUEST_MATCH_STATE" || message.type === "PLAYER_RECONNECTED") {
      this.publishMatchState();
      if (this.sharedTarget) this.delegate.publishEvent({ type: "SHARED_TARGET", sequence: ++this.sequence, matchId: this.matchId, targetId: this.sharedTarget.id, symbol: this.sharedTarget.symbol, presentedAt: Date.now() });
      else this.scheduleNextTarget();
      return;
    }
    if (message.type === "BODY_TRANSFORM_BATCH") { if (message.playerId !== playerId) return; this.delegate.publishEvent({ ...message, sequence: ++this.sequence }); return; }
    if (message.type === "BOARD_SNAPSHOT") { if (message.playerId !== playerId) return; this.boards.set(playerId, message.bodies); this.persistAuthority(); this.delegate.publishSnapshot({ ...message, sequence: ++this.sequence }); return; }
    if (message.type === "CLAIM_SHARED_TARGET") { this.claimTarget(message, playerId); return; }
    if (message.type === "RESULT_RECORDED_COMMAND") {
      if (playerId !== this.hostPlayerId) return;
      this.delegate.publishEvent({ type: "RESULT_RECORDED", sequence: ++this.sequence, matchId: this.matchId, recordedAt: message.recordedAt });
      return;
    }
    if (message.type === "REMOVE_LETTER_COMMAND") { this.remove(message, playerId); return; }
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
  private finish(loserPlayerId: string, reason: "DANGER_LINE" | "FORFEIT"): void {
    const loser = this.players.get(loserPlayerId); if (!loser || loser.gameOver) return; loser.gameOver = true;
    if (this.targetTimer) clearTimeout(this.targetTimer); this.targetTimer = null; this.sharedTarget = null;
    this.clearPersistedAuthority();
    const winnerPlayerId = this.playerIds.find((id) => id !== loserPlayerId) ?? null;
    this.delegate.publishEvent({ type: "MATCH_FINISHED", sequence: ++this.sequence, matchId: this.matchId, winnerPlayerId, loserPlayerId, reason, finishedAt: Date.now(), results: this.playerIds.map((id) => { const state = this.players.get(id)!; return { playerId: id, score: state.score, maxCombo: state.maxCombo, removedCount: state.removedCount, attackCount: 0 }; }) });
  }
  private storageKey(): string { return `${AUTHORITY_STORAGE_PREFIX}${this.localPlayerId}:${this.roomId}`; }
  private persistAuthority(): void {
    if (!this.isHost() || !this.roomId || typeof window === "undefined") return;
    const value: PersistedAuthority = { roomId: this.roomId, hostPlayerId: this.hostPlayerId, playerIds: this.playerIds, sequence: this.sequence, startAt: this.startAt, spawnIndex: this.spawnIndex, targetIndex: this.targetIndex, sharedTarget: this.sharedTarget, players: [...this.players.entries()], letters: [...this.letters.entries()], boards: [...this.boards.entries()] };
    try { window.sessionStorage.setItem(this.storageKey(), JSON.stringify(value)); } catch { /* Storage is optional; a connected peer can still resync. */ }
  }
  private restoreAuthority(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(this.storageKey()); if (!raw) return;
      const saved = JSON.parse(raw) as PersistedAuthority;
      if (saved.roomId !== this.roomId || saved.hostPlayerId !== this.hostPlayerId || saved.playerIds.length !== this.playerIds.length || saved.playerIds.some((id) => !this.playerIds.includes(id))) return;
      this.sequence = saved.sequence; this.startAt = saved.startAt ?? Date.now(); this.spawnIndex = saved.spawnIndex; this.targetIndex = saved.targetIndex; this.sharedTarget = saved.sharedTarget;
      this.players.clear(); for (const [id, state] of saved.players) this.players.set(id, state);
      this.letters.clear(); for (const [id, letter] of saved.letters) this.letters.set(id, letter);
      this.boards.clear(); for (const [id, bodies] of saved.boards) this.boards.set(id, bodies);
      this.restoredAuthority = true;
    } catch { this.clearPersistedAuthority(); }
  }
  private clearPersistedAuthority(): void { try { if (typeof window !== "undefined") window.sessionStorage.removeItem(this.storageKey()); } catch { /* no-op */ } }
}
function freshPlayer(): PlayerState { return { score: 0, combo: 0, maxCombo: 0, removedCount: 0, gameOver: false }; }
const SYMBOLS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅔ", "ㅚ", "ㅟ", "ㅢ"] as const;
function isBattleEvent(value: unknown): value is ServerBattleMessage { return !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" && ["START_MATCH", "MATCH_STARTED", "GAME_START", "SHARED_TARGET", "SHARED_TARGET_CLAIMED", "SPAWN_LETTER", "REMOVE_LETTER_ACCEPTED", "REMOVE_LETTER_REJECTED", "SCORE_UPDATED", "COMBO_UPDATED", "ATTACK_CREATED", "ATTACK_APPLIED", "MATCH_FINISHED", "RESULT_RECORDED", "PLAYER_DISCONNECTED", "PLAYER_RECONNECTED", "BODY_TRANSFORM_BATCH", "BOARD_SNAPSHOT", "LETTER_SPAWNED_SYNC", "LETTER_STATE_SYNC", "LETTER_REMOVED_SYNC", "OTTER_TRANSFER"].includes((value as { type: string }).type); }
