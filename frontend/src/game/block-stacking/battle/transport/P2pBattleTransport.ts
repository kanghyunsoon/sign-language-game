import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { WebRtcDataChannelTransport } from "../../../realtime";
import type { BattleGameTransport } from "./BattleGameTransport";
import type { BattleBodyTransform, BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, ServerBattleMessage } from "./battleTransportTypes";

type PeerCommand = ClientBattleMessage;
interface PlayerState { score: number; combo: number; maxCombo: number; removedCount: number; gameOver: boolean; }
const CLAIM_EFFECT_DURATION_MS = 1_150;
const NEXT_TARGET_DELAY_MS = 2_300;

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
  private spawnIndex = 0;
  private targetIndex = 0;
  private sharedTarget: { readonly id: string; readonly symbol: string } | null = null;
  private targetTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeCommands: (() => void) | null = null;
  private connectGeneration = 0;

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
      this.startAuthority();
    } else {
      this.delegate.send({ type: "REQUEST_MATCH_STATE", commandId: crypto.randomUUID(), matchId: this.matchId, occurredAt: Date.now() });
    }
  }
  disconnect(): void { this.connectGeneration += 1; this.unsubscribeCommands?.(); this.unsubscribeCommands = null; if (this.targetTimer) clearTimeout(this.targetTimer); this.targetTimer = null; this.delegate.disconnect(); }
  send(message: ClientBattleMessage): void { if (this.isHost()) this.handle(message, this.localPlayerId); else this.delegate.send(message); }
  subscribe(listener: (message: ServerBattleMessage) => void): () => void { return this.delegate.subscribe(listener); }
  subscribeConnectionState(listener: (state: BattleConnectionState) => void): () => void { return this.delegate.subscribeConnectionState(listener); }
  getConnectionState(): BattleConnectionState { return this.delegate.getConnectionState(); }

  private isHost(): boolean { return this.localPlayerId === this.hostPlayerId; }
  private startAuthority(): void {
    this.publishStart();
    if (this.sharedTarget || this.targetTimer) return;
    this.scheduleNextTarget(800);
  }
  private publishStart(): void {
    const now = Date.now();
    this.delegate.publishEvent({ type: "MATCH_STARTED", sequence: ++this.sequence, matchId: this.matchId, roomId: this.roomId, playerIds: this.playerIds, startAt: now + 800, serverTime: now });
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
  }
  private handle(message: ClientBattleMessage, playerId: string): void {
    if (!this.isHost() || !(this.playerIds as readonly string[]).includes(playerId) || ("matchId" in message && message.matchId !== this.matchId)) return;
    if ("commandId" in message) { if (this.processed.has(message.commandId)) return; this.processed.add(message.commandId); }
    if (message.type === "REQUEST_MATCH_STATE" || message.type === "PLAYER_RECONNECTED") {
      this.publishStart();
      if (this.sharedTarget) this.delegate.publishEvent({ type: "SHARED_TARGET", sequence: ++this.sequence, matchId: this.matchId, targetId: this.sharedTarget.id, symbol: this.sharedTarget.symbol, presentedAt: Date.now() });
      else this.scheduleNextTarget();
      return;
    }
    if (message.type === "BODY_TRANSFORM_BATCH") { if (message.playerId !== playerId) return; this.delegate.publishEvent({ ...message, sequence: ++this.sequence }); return; }
    if (message.type === "BOARD_SNAPSHOT") { if (message.playerId !== playerId) return; this.boards.set(playerId, message.bodies); this.delegate.publishSnapshot({ ...message, sequence: ++this.sequence }); return; }
    if (message.type === "CLAIM_SHARED_TARGET") { this.claimTarget(message, playerId); return; }
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
  }
  private finish(loserPlayerId: string, reason: "DANGER_LINE" | "FORFEIT"): void {
    const loser = this.players.get(loserPlayerId); if (!loser || loser.gameOver) return; loser.gameOver = true;
    if (this.targetTimer) clearTimeout(this.targetTimer); this.targetTimer = null; this.sharedTarget = null;
    const winnerPlayerId = this.playerIds.find((id) => id !== loserPlayerId) ?? null;
    this.delegate.publishEvent({ type: "MATCH_FINISHED", sequence: ++this.sequence, matchId: this.matchId, winnerPlayerId, loserPlayerId, reason, finishedAt: Date.now(), results: this.playerIds.map((id) => { const state = this.players.get(id)!; return { playerId: id, score: state.score, maxCombo: state.maxCombo, removedCount: state.removedCount, attackCount: 0 }; }) });
  }
}
function freshPlayer(): PlayerState { return { score: 0, combo: 0, maxCombo: 0, removedCount: 0, gameOver: false }; }
const SYMBOLS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅔ", "ㅚ", "ㅟ", "ㅢ"] as const;
function isBattleEvent(value: unknown): value is ServerBattleMessage { return !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" && ["START_MATCH", "MATCH_STARTED", "GAME_START", "SHARED_TARGET", "SHARED_TARGET_CLAIMED", "SPAWN_LETTER", "REMOVE_LETTER_ACCEPTED", "REMOVE_LETTER_REJECTED", "SCORE_UPDATED", "COMBO_UPDATED", "ATTACK_CREATED", "ATTACK_APPLIED", "MATCH_FINISHED", "PLAYER_DISCONNECTED", "PLAYER_RECONNECTED", "BODY_TRANSFORM_BATCH", "BOARD_SNAPSHOT", "LETTER_SPAWNED_SYNC", "LETTER_STATE_SYNC", "LETTER_REMOVED_SYNC", "OTTER_TRANSFER"].includes((value as { type: string }).type); }
