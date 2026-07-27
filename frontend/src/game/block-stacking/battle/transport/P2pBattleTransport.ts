import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { WebRtcDataChannelTransport } from "../../../realtime";
import type { BattleGameTransport } from "./BattleGameTransport";
import type { BattleBodyTransform, BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, ServerBattleMessage } from "./battleTransportTypes";

type PeerCommand = ClientBattleMessage;
interface PlayerState { score: number; combo: number; maxCombo: number; removedCount: number; gameOver: boolean; }

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
  private spawnTimer: ReturnType<typeof setInterval> | null = null;
  private otterTimer: ReturnType<typeof setInterval> | null = null;
  private readonly otterThrowTimers = new Set<ReturnType<typeof setTimeout>>();
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
  disconnect(): void { this.connectGeneration += 1; this.unsubscribeCommands?.(); this.unsubscribeCommands = null; if (this.spawnTimer) clearInterval(this.spawnTimer); if (this.otterTimer) clearInterval(this.otterTimer); for (const timer of this.otterThrowTimers) clearTimeout(timer); this.otterThrowTimers.clear(); this.spawnTimer = null; this.otterTimer = null; this.delegate.disconnect(); }
  send(message: ClientBattleMessage): void { if (this.isHost()) this.handle(message, this.localPlayerId); else this.delegate.send(message); }
  subscribe(listener: (message: ServerBattleMessage) => void): () => void { return this.delegate.subscribe(listener); }
  subscribeConnectionState(listener: (state: BattleConnectionState) => void): () => void { return this.delegate.subscribeConnectionState(listener); }
  getConnectionState(): BattleConnectionState { return this.delegate.getConnectionState(); }

  private isHost(): boolean { return this.localPlayerId === this.hostPlayerId; }
  private startAuthority(): void {
    this.publishStart();
    if (this.spawnTimer) return;
    this.spawnTimer = setInterval(() => this.spawn(), 1_600);
    this.otterTimer ??= setInterval(() => this.transferOtterLetter(), 60_000);
    const firstOtterTimer = setTimeout(() => { this.otterThrowTimers.delete(firstOtterTimer); this.transferOtterLetter(); }, 18_000);
    this.otterThrowTimers.add(firstOtterTimer);
    this.spawn();
  }
  private publishStart(): void {
    const now = Date.now();
    this.delegate.publishEvent({ type: "MATCH_STARTED", sequence: ++this.sequence, matchId: this.matchId, roomId: this.roomId, playerIds: this.playerIds, startAt: now + 800, serverTime: now });
    for (const [playerId, bodies] of this.boards) this.delegate.publishSnapshot({ type: "BOARD_SNAPSHOT", sequence: ++this.sequence, matchId: this.matchId, playerId, sentAt: now, bodies });
  }
  private spawn(): void {
    if (this.playerIds.length !== 2 || [...this.players.values()].some((player) => player.gameOver)) return;
    const symbol = SYMBOLS[this.spawnIndex % SYMBOLS.length];
    for (const playerId of this.playerIds) {
      const letterId = `${this.matchId}-${playerId}-${this.spawnIndex}`;
      this.letters.set(letterId, { playerId, symbol });
      this.delegate.publishEvent({ type: "SPAWN_LETTER", sequence: ++this.sequence, matchId: this.matchId, playerId, letterId, spawnIndex: this.spawnIndex, symbol, spawnAt: Date.now(), normalizedX: 0.18 + ((this.spawnIndex * 37) % 64) / 100, initialAngle: 0 });
    }
    this.spawnIndex += 1;
  }
  private transferOtterLetter(): void {
    if (this.playerIds.length !== 2 || [...this.players.values()].some((player) => player.gameOver)) return;
    const sourcePlayerId = this.playerIds[Math.floor(Math.random() * this.playerIds.length)];
    const activeIds = new Set((this.boards.get(sourcePlayerId) ?? []).filter((body) => body.state !== "REMOVED").map((body) => body.id));
    const sourceLetter = [...this.letters.entries()].find(([letterId, letter]) => letter.playerId === sourcePlayerId && activeIds.has(letterId));
    if (!sourceLetter) return;
    const [sourceLetterId, source] = sourceLetter;
    const targetPlayerId = this.playerIds.find((playerId) => playerId !== sourcePlayerId);
    if (!targetPlayerId) return;
    const now = Date.now();
    const direction = sourcePlayerId === this.playerIds[0] ? "left-to-right" : "right-to-left";
    this.letters.delete(sourceLetterId);
    this.delegate.publishEvent({ type: "OTTER_TRANSFER", sequence: ++this.sequence, matchId: this.matchId, sourcePlayerId, targetPlayerId, sourceLetterId, symbol: source.symbol, direction, pickupAt: now + 1_450, throwAt: now + 5_100 });
    const timer = setTimeout(() => {
      this.otterThrowTimers.delete(timer);
      if (this.players.get(targetPlayerId)?.gameOver) return;
      const letterId = this.matchId + "-" + targetPlayerId + "-otter-" + this.spawnIndex++;
      this.letters.set(letterId, { playerId: targetPlayerId, symbol: source.symbol });
      this.delegate.publishEvent({ type: "SPAWN_LETTER", sequence: ++this.sequence, matchId: this.matchId, playerId: targetPlayerId, letterId, spawnIndex: this.spawnIndex, symbol: source.symbol, spawnAt: Date.now(), normalizedX: .5, initialAngle: 0, targetPriority: true });
    }, 5_100);
    this.otterThrowTimers.add(timer);
  }
  private handle(message: ClientBattleMessage, playerId: string): void {
    if (!this.isHost() || !(this.playerIds as readonly string[]).includes(playerId) || ("matchId" in message && message.matchId !== this.matchId)) return;
    if ("commandId" in message) { if (this.processed.has(message.commandId)) return; this.processed.add(message.commandId); }
    if (message.type === "REQUEST_MATCH_STATE" || message.type === "PLAYER_RECONNECTED") { this.publishStart(); this.spawn(); return; }
    if (message.type === "BODY_TRANSFORM_BATCH") { if (message.playerId !== playerId) return; this.delegate.publishEvent({ ...message, sequence: ++this.sequence }); return; }
    if (message.type === "BOARD_SNAPSHOT") { if (message.playerId !== playerId) return; this.boards.set(playerId, message.bodies); this.delegate.publishSnapshot({ ...message, sequence: ++this.sequence }); return; }
    if (message.type === "REMOVE_LETTER_COMMAND") { this.remove(message, playerId); return; }
    if (message.type === "PLAYER_GAME_OVER_COMMAND") this.finish(playerId);
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
  private finish(loserPlayerId: string): void {
    const loser = this.players.get(loserPlayerId); if (!loser || loser.gameOver) return; loser.gameOver = true;
    if (this.spawnTimer) clearInterval(this.spawnTimer); this.spawnTimer = null;
    const winnerPlayerId = this.playerIds.find((id) => id !== loserPlayerId) ?? null;
    this.delegate.publishEvent({ type: "MATCH_FINISHED", sequence: ++this.sequence, matchId: this.matchId, winnerPlayerId, loserPlayerId, reason: "DANGER_LINE", finishedAt: Date.now(), results: this.playerIds.map((id) => { const state = this.players.get(id)!; return { playerId: id, score: state.score, maxCombo: state.maxCombo, removedCount: state.removedCount, attackCount: 0 }; }) });
  }
}
function freshPlayer(): PlayerState { return { score: 0, combo: 0, maxCombo: 0, removedCount: 0, gameOver: false }; }
const SYMBOLS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ"] as const;
function isBattleEvent(value: unknown): value is ServerBattleMessage { return !!value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" && ["START_MATCH", "MATCH_STARTED", "GAME_START", "SPAWN_LETTER", "REMOVE_LETTER_ACCEPTED", "REMOVE_LETTER_REJECTED", "SCORE_UPDATED", "COMBO_UPDATED", "ATTACK_CREATED", "ATTACK_APPLIED", "MATCH_FINISHED", "PLAYER_DISCONNECTED", "PLAYER_RECONNECTED", "BODY_TRANSFORM_BATCH", "BOARD_SNAPSHOT", "LETTER_SPAWNED_SYNC", "LETTER_STATE_SYNC", "LETTER_REMOVED_SYNC", "OTTER_TRANSFER"].includes((value as { type: string }).type); }