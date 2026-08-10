import type {
  AttackCreatedEvent,
  ClientBattleMessage,
  MatchFinishedEvent,
  MatchStartedEvent,
  RemoveAcceptedEvent,
  ServerBattleMessage,
  SpawnLetterEvent,
} from "../transport/battleTransportTypes";
import { isCompetitiveRecognitionReady } from "../../../recognition/readiness/recognitionReadiness";

/** Fingerspelling symbols allowed in competitive play (kept in sync with the bot practice pool). */
const SYMBOLS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"].filter(isCompetitiveRecognitionReady);

const POINTS_PER_REMOVAL = 100;
const ATTACK_COMBO_INTERVAL = 3;
const DEFAULT_COUNTDOWN_MS = 3_000;
const DEFAULT_SPAWN_INTERVAL_MS = 1_800;
const SPAWN_AFTER_ACCEPT_MS = 250;

export interface BattleP2pAuthorityOptions {
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  readonly countdownMs?: number;
  readonly spawnIntervalMs?: number;
}

interface PlayerRuntime { score: number; combo: number; maxCombo: number; removedCount: number; }

/**
 * Host-only authoritative engine for a two-player block-stacking match carried by the
 * WebRTC DataChannel.  It owns match start, letter spawning, removal scoring/combo,
 * attack generation, and the finish verdict.  Physics runs client-side; per-board
 * mirror messages (BODY_TRANSFORM_BATCH/BOARD_SNAPSHOT/LETTER_*_SYNC) are relayed by the
 * transport and never pass through this class.
 */
export class BattleP2pAuthority {
  private readonly listeners = new Set<(event: ServerBattleMessage) => void>();
  private readonly processedCommands = new Set<string>();
  private readonly players = new Map<string, PlayerRuntime>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly setTimer: NonNullable<BattleP2pAuthorityOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<BattleP2pAuthorityOptions["clearTimer"]>;
  private readonly countdownMs: number;
  private readonly spawnIntervalMs: number;
  private sequence = 0;
  private spawnIndex = 0;
  private started = false;
  private finished = false;

  constructor(
    readonly matchId: string,
    readonly roomId: string,
    readonly playerIds: readonly [string, string],
    options: BattleP2pAuthorityOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.countdownMs = options.countdownMs ?? DEFAULT_COUNTDOWN_MS;
    this.spawnIntervalMs = options.spawnIntervalMs ?? DEFAULT_SPAWN_INTERVAL_MS;
    for (const playerId of playerIds) this.players.set(playerId, { score: 0, combo: 0, maxCombo: 0, removedCount: 0 });
  }

  subscribe(listener: (event: ServerBattleMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Idempotent: safe to call from both the connect fallback timer and REQUEST_MATCH_STATE. */
  ensureStarted(): void {
    if (this.started) return;
    this.start();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const startedAt = this.now();
    const startAt = startedAt + this.countdownMs;
    const started: MatchStartedEvent = {
      type: "MATCH_STARTED",
      sequence: ++this.sequence,
      matchId: this.matchId,
      roomId: this.roomId,
      playerIds: [...this.playerIds],
      startAt,
      serverTime: startedAt,
    };
    this.emit(started);
    // The client counts down locally; begin spawning once boards are live.
    this.later(() => { this.spawnRound(); this.spawnRound(); this.scheduleSpawns(); }, this.countdownMs);
  }

  submit(playerId: string, command: ClientBattleMessage): void {
    if (this.finished || !this.players.has(playerId) || command.matchId !== this.matchId) return;
    switch (command.type) {
      case "REMOVE_LETTER_COMMAND":
        this.acceptRemoval(playerId, command);
        break;
      case "PLAYER_GAME_OVER_COMMAND":
        this.finish(playerId, "DANGER_LINE");
        break;
      case "REQUEST_MATCH_STATE":
        this.ensureStarted();
        break;
      default:
        // BODY_TRANSFORM_BATCH / BOARD_SNAPSHOT are mirror data relayed by the transport.
        break;
    }
  }

  dispose(): void {
    this.clearTimers();
    this.listeners.clear();
  }

  private acceptRemoval(playerId: string, command: Extract<ClientBattleMessage, { type: "REMOVE_LETTER_COMMAND" }>): void {
    if (this.processedCommands.has(command.commandId)) return;
    this.processedCommands.add(command.commandId);
    const runtime = this.players.get(playerId)!;
    runtime.score += POINTS_PER_REMOVAL;
    runtime.combo += 1;
    runtime.maxCombo = Math.max(runtime.maxCombo, runtime.combo);
    runtime.removedCount += 1;
    const acceptedAt = this.now();
    const accepted: RemoveAcceptedEvent = {
      type: "REMOVE_LETTER_ACCEPTED",
      sequence: ++this.sequence,
      commandId: command.commandId,
      playerId,
      letterId: command.letterId,
      symbol: command.symbol,
      score: runtime.score,
      combo: runtime.combo,
      maxCombo: runtime.maxCombo,
      removedCount: runtime.removedCount,
      acceptedAt,
    };
    this.emit(accepted);
    if (runtime.combo > 0 && runtime.combo % ATTACK_COMBO_INTERVAL === 0) {
      const attack: AttackCreatedEvent = {
        type: "ATTACK_CREATED",
        sequence: ++this.sequence,
        attackId: this.createId(),
        attackerPlayerId: playerId,
        targetPlayerId: this.opponentOf(playerId),
        attackType: "SHAKE",
        amount: 1,
        sourceCombo: runtime.combo,
        createdAt: acceptedAt,
      };
      this.emit(attack);
    }
    this.later(() => this.spawnFor(playerId), SPAWN_AFTER_ACCEPT_MS);
  }

  private finish(reportedPlayerId: string, reason: string): void {
    if (this.finished) return;
    this.finished = true;
    this.clearTimers();
    const finishedAt = this.now();
    const winnerPlayerId = reason === "DANGER_LINE"
      ? reportedPlayerId
      : this.opponentOf(reportedPlayerId);
    const loserPlayerId = this.opponentOf(winnerPlayerId);
    const finished: MatchFinishedEvent = {
      type: "MATCH_FINISHED",
      sequence: ++this.sequence,
      matchId: this.matchId,
      winnerPlayerId,
      loserPlayerId,
      reason,
      finishedAt,
      results: this.playerIds.map((playerId) => {
        const runtime = this.players.get(playerId)!;
        return { playerId, score: runtime.score, maxCombo: runtime.maxCombo, removedCount: runtime.removedCount, attackCount: 0 };
      }),
    };
    this.emit(finished);
  }

  private spawnRound(): void {
    for (const playerId of this.playerIds) this.spawnFor(playerId);
  }

  private spawnFor(playerId: string): void {
    if (this.finished || !this.started) return;
    const index = this.spawnIndex++;
    const symbol = SYMBOLS[index % SYMBOLS.length]!;
    const spawn: SpawnLetterEvent = {
      type: "SPAWN_LETTER",
      sequence: ++this.sequence,
      matchId: this.matchId,
      playerId,
      letterId: `${this.matchId}-${playerId}-${index}`,
      spawnIndex: index,
      symbol,
      spawnAt: this.now(),
      normalizedX: 0.12 + (index % 6) * 0.15,
      initialAngle: 0,
    };
    this.emit(spawn);
  }

  private scheduleSpawns(): void {
    this.later(() => { this.spawnRound(); this.scheduleSpawns(); }, this.spawnIntervalMs);
  }

  private opponentOf(playerId: string): string {
    return this.playerIds[0] === playerId ? this.playerIds[1] : this.playerIds[0];
  }

  private later(callback: () => void, delay: number): void {
    const timer = this.setTimer(() => {
      this.timers.delete(timer);
      if (!this.finished) callback();
    }, delay);
    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const timer of this.timers) this.clearTimer(timer);
    this.timers.clear();
  }

  private emit(event: ServerBattleMessage): void {
    for (const listener of this.listeners) listener(event);
  }
}
