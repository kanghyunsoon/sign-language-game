import type { SignRecognizer } from "../../../recognition/core/SignRecognizer";
import type { SignRecognitionEvent } from "../../../recognition/types/events";
import type { BattleAttackEffect } from "../attack/BattleAttackEffect";
import type { RemoteBoardReplica, RemoteSyncMessage } from "../sync/RemoteBoardReplica";
import type { BattleGameTransport } from "../transport/BattleGameTransport";
import type { AttackCreatedEvent, BattleConnectionOptions, BattleConnectionState, MatchFinishedEvent, OtterTransferEvent, ServerBattleMessage } from "../transport/battleTransportTypes";
import type { BattleLocalBoard } from "./BattleLocalBoardRuntime";
import { BattleStateMachine, type BattlePageState } from "./BattleStateMachine";

export interface BattleControllerSnapshot { readonly state: BattlePageState; readonly gameConnectionState: BattleConnectionState; readonly aiConnectionState: string; readonly countdownMs: number; readonly reconnectDeadlineAt: number | null; readonly score: number; readonly combo: number; readonly maxCombo: number; readonly removedCount: number; readonly targetSymbol: string | null; readonly prediction: { readonly symbol: string; readonly confidence: number } | null; readonly message: string; readonly result: MatchFinishedEvent | null; }
export interface BattleControllerOptions { readonly playerId: string; readonly roomId: string; readonly initialMatchId?: string; readonly transport: BattleGameTransport; readonly localBoard: BattleLocalBoard; readonly remoteBoard: RemoteBoardReplica; readonly attackEffect: BattleAttackEffect; readonly recognizer?: SignRecognizer; readonly reconnectIntervalMs?: number; readonly reconnectGraceMs?: number; readonly onMatchStarted?: (matchId: string) => void; readonly onOtterTransfer?: (event: OtterTransferEvent) => void; readonly now?: () => number; readonly setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>; readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void; readonly createCommandId?: () => string; }

export class BattleController {
  private readonly machine = new BattleStateMachine(); private readonly listeners = new Set<(snapshot: BattleControllerSnapshot) => void>();
  private readonly now: () => number; private readonly setTimer: NonNullable<BattleControllerOptions["setTimer"]>; private readonly clearTimer: NonNullable<BattleControllerOptions["clearTimer"]>; private readonly createCommandId: () => string;
  private transportUnsubscribe: (() => void) | null = null; private transportStateUnsubscribe: (() => void) | null = null; private recognizerUnsubscribe: (() => void) | null = null; private startTimer: ReturnType<typeof setTimeout> | null = null; private startDeadlineAt: number | null = null; private reconnectTimer: ReturnType<typeof setTimeout> | null = null; private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionOptions: BattleConnectionOptions | null = null; private matchId: string | null = null; private gameConnectionState: BattleConnectionState = "DISCONNECTED"; private aiConnectionState = "DISCONNECTED"; private reconnectDeadlineAt: number | null = null; private countdownMs = 0; private score = 0; private combo = 0; private maxCombo = 0; private removedCount = 0; private prediction: BattleControllerSnapshot["prediction"] = null; private message = "Waiting for server start."; private result: MatchFinishedEvent | null = null; private disposed = false; private gameOverReported = false;
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
  submitRecognizedSymbol(symbol: string, confidence = 1): boolean { if (this.machine.getState() !== "PLAYING" || !this.matchId) return false; const targetSymbol = this.options.localBoard.getTargetSymbol(); const letterId = this.options.localBoard.selectRemoval(symbol); if (!letterId) { this.message = targetSymbol ? `지정 글자 ${targetSymbol}만 제거할 수 있습니다.` : "제거할 지정 블록이 없습니다."; this.publish(); return false; }
    this.options.transport.send({ type: "REMOVE_LETTER_COMMAND", commandId: this.createCommandId(), matchId: this.matchId, letterId, symbol, occurredAt: this.now() }); this.prediction = { symbol, confidence }; this.message = `${symbol} verification requested.`; this.publish(); return true;
  }
  handleRecognition(event: SignRecognitionEvent): void { if (event.type === "CONNECTION_STATE") { this.aiConnectionState = event.state; this.publish(); } else if (event.type === "PREDICTION") { this.prediction = { symbol: event.symbol, confidence: event.confidence }; this.publish(); } else if (event.type === "SIGN_CONFIRMED") this.submitRecognizedSymbol(event.symbol, event.confidence); }
  snapshot(): BattleControllerSnapshot { return { state: this.machine.getState(), gameConnectionState: this.gameConnectionState, aiConnectionState: this.aiConnectionState, countdownMs: this.countdownMs, reconnectDeadlineAt: this.reconnectDeadlineAt, score: this.score, combo: this.combo, maxCombo: this.maxCombo, removedCount: this.removedCount, targetSymbol: this.options.localBoard.getTargetSymbol(), prediction: this.prediction, message: this.message, result: this.result }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.clearReconnectTimers(); this.clearStartTimer(); this.transportUnsubscribe?.(); this.transportStateUnsubscribe?.(); this.recognizerUnsubscribe?.(); this.options.transport.disconnect(); this.options.recognizer?.disconnect(); this.options.localBoard.dispose(); this.options.remoteBoard.clear(); this.options.attackEffect.dispose(); this.listeners.clear(); }
  private handleServer(message: ServerBattleMessage): void {
    if (message.type === "START_MATCH" || message.type === "MATCH_STARTED" || message.type === "GAME_START") { const currentState = this.machine.getState(); if (this.matchId === message.matchId && (currentState === "COUNTDOWN" || currentState === "PLAYING")) return; this.matchId = message.matchId; this.gameOverReported = false; this.options.onMatchStarted?.(message.matchId); const startAt = message.startAt; const serverNow = message.serverTime ?? this.now(); const delay = Math.max(0, startAt - serverNow); this.countdownMs = delay; this.message = "Match countdown started."; this.transition("COUNTDOWN"); this.startDeadlineAt = this.now() + delay; this.scheduleStartTick(); return; }
    if (message.type === "SPAWN_LETTER") {
      if (message.playerId === this.options.playerId) {
        this.options.localBoard.spawn(message);
        this.message = `${message.symbol} is now the target.`;
        this.publish();
      } else {
        // Show the opponent's own spawn immediately.  It is replaced by that
        // player's authoritative board snapshot as soon as it arrives.
        this.options.remoteBoard.spawn(message, this.now());
      }
      return;
    }
    if (message.type === "REMOVE_LETTER_ACCEPTED") { if (message.playerId !== this.options.playerId) return; this.options.localBoard.acceptRemoval(message.letterId); this.score = message.score; this.combo = message.combo; this.maxCombo = message.maxCombo; this.removedCount = message.removedCount; this.message = `${message.symbol} accepted.`; this.publish(); return; }
    if (message.type === "REMOVE_LETTER_REJECTED") { this.options.localBoard.rejectRemoval(message.letterId); this.message = message.message; this.publish(); return; }
    if (message.type === "SCORE_UPDATED") { if (message.playerId === this.options.playerId) { this.score = message.score; this.publish(); } return; }
    if (message.type === "COMBO_UPDATED") { if (message.playerId === this.options.playerId) { this.combo = message.combo; this.maxCombo = message.maxCombo; this.publish(); } return; }
    if (message.type === "ATTACK_CREATED" || message.type === "ATTACK_APPLIED") { if (message.targetPlayerId === this.options.playerId) this.options.attackEffect.apply(message as AttackCreatedEvent); return; }
    if (message.type === "OTTER_TRANSFER") { this.options.onOtterTransfer?.(message); return; }
    if (message.type === "MATCH_FINISHED") { this.result = message; this.options.localBoard.stop(); this.message = "Match finished."; this.transition("FINISHED"); return; }
    if (message.type === "PLAYER_DISCONNECTED") { this.message = "Opponent disconnected. Reconnecting..."; if (this.machine.getState() === "PLAYING") this.transition("RECONNECTING"); return; }
    if (message.type === "PLAYER_RECONNECTED") { this.message = "Opponent reconnected."; if (this.machine.getState() === "RECONNECTING") this.transition("PLAYING"); return; }
    if ("playerId" in message && message.playerId !== this.options.playerId) {
      this.options.remoteBoard.apply(message as RemoteSyncMessage, this.now());
      if (message.type === "BOARD_SNAPSHOT" && this.machine.getState() === "RECONNECTING") { this.clearReconnectTimers(); this.reconnectDeadlineAt = null; this.options.localBoard.start(); this.message = "Match state restored."; this.transition("PLAYING"); }
    }
  }
  private handleTransportState(state: BattleConnectionState): void {
    this.gameConnectionState = state;
    const matchState = this.machine.getState();
    if ((state === "DISCONNECTED" || state === "ERROR") && (matchState === "PLAYING" || matchState === "COUNTDOWN" || matchState === "RECONNECTING")) this.beginReconnect();
    this.publish();
  }
  private beginReconnect(): void {
    if (this.disposed || !this.connectionOptions || !this.matchId) return;
    if (this.machine.getState() !== "RECONNECTING") { this.clearStartTimer(); this.options.localBoard.stop(); this.transition("RECONNECTING"); }
    if (this.reconnectDeadlineAt === null) {
      this.reconnectDeadlineAt = this.now() + (this.options.reconnectGraceMs ?? 10_000);
      this.graceTimer = this.setTimer(() => { this.graceTimer = null; this.message = "Server reconnect grace elapsed. Waiting for the official match result."; this.publish(); }, this.options.reconnectGraceMs ?? 10_000);
    }
    this.message = "Game server disconnected. Reconnecting...";
    this.scheduleReconnect();
  }
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.disposed) return;
    this.reconnectTimer = this.setTimer(() => { this.reconnectTimer = null; void this.attemptReconnect(); }, this.options.reconnectIntervalMs ?? 1_000);
  }
  private async attemptReconnect(): Promise<void> {
    if (this.disposed || !this.connectionOptions || !this.matchId || this.machine.getState() !== "RECONNECTING") return;
    try {
      await this.options.transport.connect(this.connectionOptions);
      this.options.transport.send({ type: "PLAYER_RECONNECTED", commandId: this.createCommandId(), matchId: this.matchId, occurredAt: this.now() });
      this.requestMatchState();
      this.message = "Connected. Restoring the latest board snapshot...";
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
