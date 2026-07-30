import type { SignRecognizer } from "../../../recognition/core/SignRecognizer";
import type { SignRecognitionEvent } from "../../../recognition/types/events";
import type { BattleAttackEffect } from "../attack/BattleAttackEffect";
import type { RemoteBoard, RemoteSyncMessage } from "../sync/RemoteBoardReplica";
import type { BattleGameTransport } from "../transport/BattleGameTransport";
import type { AttackCreatedEvent, BattleConnectionOptions, BattleConnectionState, MatchFinishedEvent, ServerBattleMessage, SharedTargetClaimedEvent } from "../transport/battleTransportTypes";
import type { BattleLocalBoard } from "./BattleLocalBoardRuntime";
import { BattleStateMachine, type BattlePageState } from "./BattleStateMachine";

export interface BattleControllerSnapshot { readonly state: BattlePageState; readonly gameConnectionState: BattleConnectionState; readonly aiConnectionState: string; readonly countdownMs: number; readonly reconnectDeadlineAt: number | null; readonly score: number; readonly combo: number; readonly maxCombo: number; readonly removedCount: number; readonly targetSymbol: string | null; readonly prediction: { readonly symbol: string; readonly confidence: number } | null; readonly message: string; readonly result: MatchFinishedEvent | null; }
export interface BattleControllerOptions { readonly playerId: string; readonly roomId: string; readonly initialMatchId?: string; readonly transport: BattleGameTransport; readonly localBoard: BattleLocalBoard; readonly remoteBoard: RemoteBoard; readonly attackEffect: BattleAttackEffect; readonly recognizer?: SignRecognizer; readonly sharedTargetMode?: boolean; readonly reconnectIntervalMs?: number; readonly reconnectGraceMs?: number; readonly onMatchStarted?: (matchId: string) => void; readonly onSharedTargetClaimed?: (event: SharedTargetClaimedEvent) => void; readonly now?: () => number; readonly setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>; readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void; readonly createCommandId?: () => string; }

export class BattleController {
  private readonly machine = new BattleStateMachine(); private readonly listeners = new Set<(snapshot: BattleControllerSnapshot) => void>();
  private readonly now: () => number; private readonly setTimer: NonNullable<BattleControllerOptions["setTimer"]>; private readonly clearTimer: NonNullable<BattleControllerOptions["clearTimer"]>; private readonly createCommandId: () => string;
  private transportUnsubscribe: (() => void) | null = null; private transportStateUnsubscribe: (() => void) | null = null; private recognizerUnsubscribe: (() => void) | null = null; private startTimer: ReturnType<typeof setTimeout> | null = null; private startDeadlineAt: number | null = null; private reconnectTimer: ReturnType<typeof setTimeout> | null = null; private graceTimer: ReturnType<typeof setTimeout> | null = null; private readonly pendingSpawnTimers = new Set<ReturnType<typeof setTimeout>>();
  private connectionOptions: BattleConnectionOptions | null = null; private matchId: string | null = null; private opponentPlayerId: string | null = null; private gameConnectionState: BattleConnectionState = "DISCONNECTED"; private aiConnectionState = "DISCONNECTED"; private reconnectDeadlineAt: number | null = null; private countdownMs = 0; private score = 0; private combo = 0; private maxCombo = 0; private removedCount = 0; private sharedTargetId: string | null = null; private sharedTargetSymbol: string | null = null; private pendingTargetId: string | null = null; private pendingLetterId: string | null = null; private prediction: BattleControllerSnapshot["prediction"] = null; private message = "Waiting for server start."; private result: MatchFinishedEvent | null = null; private disposed = false; private gameOverReported = false;
  constructor(private readonly options: BattleControllerOptions) { this.now = options.now ?? Date.now; this.setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay)); this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer)); this.createCommandId = options.createCommandId ?? (() => crypto.randomUUID()); options.localBoard.setGameOverHandler(() => this.reportLocalGameOver()); }
  subscribe(listener: (snapshot: BattleControllerSnapshot) => void): () => void { this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  async connect(connection: BattleConnectionOptions): Promise<void> { if (this.machine.getState() !== "IDLE" && this.machine.getState() !== "ERROR") return; this.connectionOptions = connection; this.transition("CONNECTING"); this.transportUnsubscribe = this.options.transport.subscribe((message) => this.handleServer(message)); this.transportStateUnsubscribe = this.options.transport.subscribeConnectionState((state) => this.handleTransportState(state)); this.recognizerUnsubscribe = this.options.recognizer?.subscribe((event) => this.handleRecognition(event)) ?? null;
    try {
      await Promise.all([
        this.options.transport.connect(connection),
        (this.options.recognizer?.connect() ?? Promise.resolve()).catch((cause) => {
          this.aiConnectionState = "ERROR";
          this.message = cause instanceof Error ? `AI connection failed: ${cause.message}` : "AI connection failed.";
          this.publish();
        }),
      ]);
      // A fast local transport (or server) can publish MATCH_STARTED while the
      // recognizer is still connecting. Preserve that newer lifecycle state.
      if (this.machine.getState() === "CONNECTING") this.transition("WAITING_START");
      if (this.options.initialMatchId) { this.matchId = this.options.initialMatchId; this.requestMatchState(); }
    } catch (cause) { this.message = cause instanceof Error ? cause.message : "Connection failed."; this.transition("ERROR"); }
  }
  submitRecognizedSymbol(symbol: string, confidence = 1): boolean { if (this.machine.getState() !== "PLAYING" || !this.matchId) return false;
    if (this.options.sharedTargetMode) {
      if (!this.sharedTargetId || !this.sharedTargetSymbol) return false;
      if (symbol !== this.sharedTargetSymbol) { this.message = `목표 글자 ${this.sharedTargetSymbol}를 먼저 맞혀보세요.`; this.publish(); return false; }
      if (this.pendingTargetId === this.sharedTargetId) return false;
      this.pendingTargetId = this.sharedTargetId; this.options.transport.send({ type: "CLAIM_SHARED_TARGET", commandId: this.createCommandId(), matchId: this.matchId, targetId: this.sharedTargetId, symbol, occurredAt: this.now() });
    } else {
      const letterId = this.options.localBoard.selectRemoval(symbol);
      if (!letterId || this.pendingLetterId === letterId) return false;
      this.pendingLetterId = letterId; this.options.transport.send({ type: "REMOVE_LETTER_COMMAND", commandId: this.createCommandId(), matchId: this.matchId, letterId, symbol, occurredAt: this.now() });
    }
    this.prediction = { symbol, confidence }; this.message = `${symbol} 확인 중입니다.`; this.publish(); return true;
  }
  /** Sends an authoritative forfeit before the player closes the battle screen. */
  forfeit(): boolean {
    if (!this.matchId || this.machine.getState() !== "PLAYING") return false;
    this.options.transport.send({ type: "PLAYER_FORFEIT_COMMAND", commandId: this.createCommandId(), matchId: this.matchId, occurredAt: this.now() });
    return true;
  }
  handleRecognition(event: SignRecognitionEvent): void { if (event.type === "CONNECTION_STATE") { this.aiConnectionState = event.state; this.publish(); } else if (event.type === "PREDICTION") { this.prediction = { symbol: event.symbol, confidence: event.confidence }; this.publish(); } else if (event.type === "SIGN_CONFIRMED") this.submitRecognizedSymbol(event.symbol, event.confidence); }
  snapshot(): BattleControllerSnapshot { return { state: this.machine.getState(), gameConnectionState: this.gameConnectionState, aiConnectionState: this.aiConnectionState, countdownMs: this.countdownMs, reconnectDeadlineAt: this.reconnectDeadlineAt, score: this.score, combo: this.combo, maxCombo: this.maxCombo, removedCount: this.removedCount, targetSymbol: this.options.sharedTargetMode ? this.sharedTargetSymbol : this.options.localBoard.getTargetSymbol(), prediction: this.prediction, message: this.message, result: this.result }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.clearReconnectTimers(); this.clearStartTimer(); for (const timer of this.pendingSpawnTimers) this.clearTimer(timer); this.pendingSpawnTimers.clear(); this.transportUnsubscribe?.(); this.transportStateUnsubscribe?.(); this.recognizerUnsubscribe?.(); this.options.transport.disconnect(); this.options.recognizer?.disconnect(); this.options.localBoard.dispose(); this.options.remoteBoard.clear(); this.options.attackEffect.dispose(); this.listeners.clear(); }
  private handleServer(message: ServerBattleMessage): void {
    if (message.type === "START_MATCH" || message.type === "MATCH_STARTED" || message.type === "GAME_START") {
      this.opponentPlayerId = message.playerIds.find((playerId) => playerId !== this.options.playerId) ?? null;
    }
    if (message.type === "START_MATCH" || message.type === "MATCH_STARTED" || message.type === "GAME_START") { const currentState = this.machine.getState(); if (!message.resume && this.matchId === message.matchId && (currentState === "COUNTDOWN" || currentState === "PLAYING")) return; this.matchId = message.matchId; this.gameOverReported = false; this.sharedTargetId = null; this.sharedTargetSymbol = null; this.pendingTargetId = null; this.pendingLetterId = null; const ownState = message.playerStates?.find((state) => state.playerId === this.options.playerId); if (ownState) { this.score = ownState.score; this.combo = ownState.combo; this.maxCombo = ownState.maxCombo; this.removedCount = ownState.removedCount; } if (message.resume) { this.clearReconnectTimers(); this.reconnectDeadlineAt = null; this.clearStartTimer(); this.countdownMs = 0; this.message = "Match state restored."; try { this.options.localBoard.start(); this.transition("PLAYING"); } catch (cause) { this.message = cause instanceof Error ? `Board start failed: ${cause.message}` : "Board start failed."; this.transition("ERROR"); } return; } this.options.recognizer?.resetRecognitionSession?.(); this.options.onMatchStarted?.(message.matchId); const startAt = message.startAt; const serverNow = message.serverTime ?? this.now(); const delay = Math.max(0, startAt - serverNow); this.countdownMs = delay; this.message = "Match countdown started."; this.transition("COUNTDOWN"); this.startDeadlineAt = this.now() + delay; this.scheduleStartTick(); return; }
    if (message.type === "SHARED_TARGET") { this.sharedTargetId = message.targetId; this.sharedTargetSymbol = message.symbol; this.pendingTargetId = null; this.message = `${message.symbol}를 먼저 맞혀보세요.`; this.publish(); return; }
    if (message.type === "SHARED_TARGET_CLAIMED") { if (message.targetId !== this.sharedTargetId) return; this.options.onSharedTargetClaimed?.(message); this.sharedTargetId = null; this.sharedTargetSymbol = null; this.pendingTargetId = null; if (message.winnerPlayerId === this.options.playerId) { this.score = message.score; this.combo = message.combo; this.maxCombo = message.maxCombo; this.removedCount = message.removedCount; this.message = `${message.symbol} 선점 성공!`; } else this.message = `상대가 ${message.symbol}를 먼저 맞혔습니다.`; this.publish(); return; }
    if (message.type === "SPAWN_LETTER") { this.scheduleSpawn(message); return; }
    if (message.type === "REMOVE_LETTER_ACCEPTED") { if (message.playerId !== this.options.playerId) return; this.pendingLetterId = null; this.options.localBoard.acceptRemoval(message.letterId); this.score = message.score; this.combo = message.combo; this.maxCombo = message.maxCombo; this.removedCount = message.removedCount; this.message = `${message.symbol} accepted.`; this.publish(); return; }
    if (message.type === "REMOVE_LETTER_REJECTED") { this.pendingLetterId = null; this.options.localBoard.rejectRemoval(message.letterId); this.message = message.message; this.publish(); return; }
    if (message.type === "SCORE_UPDATED") { if (message.playerId === this.options.playerId) { this.score = message.score; this.publish(); } return; }
    if (message.type === "COMBO_UPDATED") { if (message.playerId === this.options.playerId) { this.combo = message.combo; this.maxCombo = message.maxCombo; this.publish(); } return; }
    if (message.type === "ATTACK_CREATED" || message.type === "ATTACK_APPLIED") { if (message.targetPlayerId === this.options.playerId) this.options.attackEffect.apply(message as AttackCreatedEvent); return; }
    if (message.type === "MATCH_FINISHED") { this.result = message; this.options.localBoard.stop(); this.message = "Match finished."; this.transition("FINISHED"); return; }
    if (message.type === "PLAYER_DISCONNECTED") { if (message.playerId !== this.options.playerId) this.continueDuringPeerReconnect(); return; }
    if (message.type === "PLAYER_RECONNECTED") { this.clearReconnectTimers(); this.reconnectDeadlineAt = null; this.message = "Opponent reconnected."; if (this.machine.getState() === "RECONNECTING") this.transition("PLAYING"); else this.publish(); return; }
    if (message.type === "BOARD_SNAPSHOT" && message.playerId === this.options.playerId) {
      this.options.localBoard.restore?.(message.bodies);
      return;
    }
    if ("playerId" in message && message.playerId !== this.options.playerId) {
      this.options.remoteBoard.apply(message as RemoteSyncMessage, this.now());
      if (message.type === "BOARD_SNAPSHOT") { this.clearReconnectTimers(); this.reconnectDeadlineAt = null; }
      if (message.type === "BOARD_SNAPSHOT" && this.machine.getState() === "RECONNECTING") { this.clearReconnectTimers(); this.reconnectDeadlineAt = null; this.options.localBoard.start(); this.message = "Match state restored."; this.transition("PLAYING"); }
    }
  }
  private handleTransportState(state: BattleConnectionState): void {
    this.gameConnectionState = state;
    const matchState = this.machine.getState();
    if ((state === "DISCONNECTED" || state === "ERROR") && (matchState === "PLAYING" || matchState === "COUNTDOWN" || matchState === "RECONNECTING")) this.continueDuringPeerReconnect();
    this.publish();
  }
  private scheduleSpawn(message: Extract<ServerBattleMessage, { type: "SPAWN_LETTER" }>): void {
    const spawn = () => {
      if (this.disposed) return;
      if (message.playerId === this.options.playerId) {
        this.options.localBoard.spawn(message);
        this.message = `${message.symbol} is now the target.`;
        this.publish();
      } else {
        this.options.remoteBoard.spawn(message, this.now());
      }
    };
    const delay = Math.max(0, message.spawnAt - this.now());
    if (delay === 0) { spawn(); return; }
    const timer = this.setTimer(() => { this.pendingSpawnTimers.delete(timer); spawn(); }, delay);
    this.pendingSpawnTimers.add(timer);
  }
  private beginReconnect(): void {
    if (this.disposed || !this.connectionOptions || !this.matchId) return;
    if (this.machine.getState() !== "RECONNECTING") { this.clearStartTimer(); this.options.localBoard.stop(); this.transition("RECONNECTING"); }
    if (this.reconnectDeadlineAt === null) {
      this.reconnectDeadlineAt = this.now() + (this.options.reconnectGraceMs ?? 10_000);
      this.graceTimer = this.setTimer(() => {
        this.graceTimer = null;
        if (this.machine.getState() !== "RECONNECTING" || !this.matchId) return;
        this.clearReconnectTimers();
        this.result = {
          type: "MATCH_FINISHED",
          sequence: Number.MAX_SAFE_INTEGER,
          matchId: this.matchId,
          winnerPlayerId: this.options.playerId,
          loserPlayerId: this.opponentPlayerId,
          reason: "RECONNECT_TIMEOUT",
          finishedAt: this.now(),
          results: [
            { playerId: this.options.playerId, score: this.score, maxCombo: this.maxCombo, removedCount: this.removedCount, attackCount: 0 },
            ...(this.opponentPlayerId ? [{ playerId: this.opponentPlayerId, score: 0, maxCombo: 0, removedCount: 0, attackCount: 0 }] : []),
          ],
        };
        this.options.localBoard.stop();
        this.message = "Opponent did not reconnect in time. You win!";
        this.transition("FINISHED");
      }, this.options.reconnectGraceMs ?? 10_000);
    }
    this.message = "Game server disconnected. Reconnecting...";
    this.scheduleReconnect();
  }
  private continueDuringPeerReconnect(): void {
    if (this.disposed || !this.connectionOptions || !this.matchId) return;
    // The player who remains must keep their local physics board and input
    // active. Only the returning browser restores a snapshot; the active
    // browser retries the channel in the background without a countdown.
    this.message = "Opponent reconnecting. Game continues.";
    if (this.reconnectDeadlineAt === null) {
      this.reconnectDeadlineAt = this.now() + (this.options.reconnectGraceMs ?? 10_000);
      this.graceTimer = this.setTimer(() => {
        this.graceTimer = null;
        if (this.disposed || !this.matchId || this.machine.getState() !== "PLAYING") return;
        this.clearReconnectTimers();
        this.reconnectDeadlineAt = null;
        this.result = {
          type: "MATCH_FINISHED",
          sequence: Number.MAX_SAFE_INTEGER,
          matchId: this.matchId,
          winnerPlayerId: this.options.playerId,
          loserPlayerId: this.opponentPlayerId,
          reason: "RECONNECT_TIMEOUT",
          finishedAt: this.now(),
          results: [
            { playerId: this.options.playerId, score: this.score, maxCombo: this.maxCombo, removedCount: this.removedCount, attackCount: 0 },
            ...(this.opponentPlayerId ? [{ playerId: this.opponentPlayerId, score: 0, maxCombo: 0, removedCount: 0, attackCount: 0 }] : []),
          ],
        };
        this.options.localBoard.stop();
        this.message = "Opponent left. You win!";
        this.transition("FINISHED");
      }, this.options.reconnectGraceMs ?? 10_000);
    }
    this.scheduleReconnect();
    this.publish();
  }
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.disposed) return;
    this.reconnectTimer = this.setTimer(() => { this.reconnectTimer = null; void this.attemptReconnect(); }, this.options.reconnectIntervalMs ?? 1_000);
  }
  private async attemptReconnect(): Promise<void> {
    if (this.disposed || !this.connectionOptions || !this.matchId || (this.machine.getState() !== "RECONNECTING" && this.machine.getState() !== "PLAYING")) return;
    try {
      await this.options.transport.connect(this.connectionOptions);
      this.options.transport.send({ type: "PLAYER_RECONNECTED", commandId: this.createCommandId(), matchId: this.matchId, occurredAt: this.now() });
      this.requestMatchState();
      this.message = this.machine.getState() === "PLAYING" ? "Opponent reconnecting. Game continues." : "Connected. Restoring the latest board snapshot...";
      this.publish();
    } catch { this.message = "Reconnect attempt failed. Retrying..."; this.publish(); this.scheduleReconnect(); }
  }
  private clearReconnectTimers(): void { if (this.reconnectTimer) this.clearTimer(this.reconnectTimer); if (this.graceTimer) this.clearTimer(this.graceTimer); this.reconnectTimer = null; this.graceTimer = null; }
  private clearStartTimer(): void { if (this.startTimer) this.clearTimer(this.startTimer); this.startTimer = null; this.startDeadlineAt = null; }
  private scheduleStartTick(): void {
    if (this.disposed || this.machine.getState() !== "COUNTDOWN" || this.startDeadlineAt === null) return;
    const remaining = Math.max(0, this.startDeadlineAt - this.now());
    this.countdownMs = remaining;
    if (remaining === 0) {
      this.startTimer = null; this.startDeadlineAt = null;
      try {
        this.options.localBoard.start(); this.transition("PLAYING");
      } catch (cause) {
        this.message = cause instanceof Error ? `Board start failed: ${cause.message}` : "Board start failed.";
        this.transition("ERROR");
      }
      return;
    }
    this.publish();
    this.startTimer = this.setTimer(() => { this.startTimer = null; this.scheduleStartTick(); }, Math.min(100, remaining));
  }
  private requestMatchState(): void { if (this.matchId) this.options.transport.send({ type: "REQUEST_MATCH_STATE", commandId: this.createCommandId(), matchId: this.matchId, occurredAt: this.now() }); }
  private reportLocalGameOver(): void {
    if (this.disposed || this.gameOverReported || !this.matchId || this.machine.getState() !== "PLAYING") return;
    this.gameOverReported = true;
    this.message = "Danger line reached. Waiting for the official result.";
    this.options.transport.send({ type: "PLAYER_GAME_OVER_COMMAND", commandId: this.createCommandId(), matchId: this.matchId, occurredAt: this.now() });
    this.publish();
  }
  private transition(next: BattlePageState): void { this.machine.transition(next); this.publish(); }
  private publish(): void { const snapshot = this.snapshot(); for (const listener of this.listeners) listener(snapshot); }
}
