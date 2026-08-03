import type { SignRecognizer } from "../../../recognition/core/SignRecognizer";
import type { SignRecognitionEvent } from "../../../recognition/types/events";
import type { BattleAttackEffect } from "../attack/BattleAttackEffect";
import type { RemoteBoard, RemoteSyncMessage } from "../sync/RemoteBoardReplica";
import type { BattleGameTransport } from "../transport/BattleGameTransport";
import type { AttackCreatedEvent, BattleConnectionOptions, BattleConnectionState, BoardSnapshotEvent, ComboUpdatedEvent, HammerAttackEvent, MatchFinishedEvent, PlayerProfileUpdatedEvent, ServerBattleMessage, SharedTargetClaimedEvent } from "../transport/battleTransportTypes";
import type { BattleLocalBoard } from "./BattleLocalBoardRuntime";
import { BattleStateMachine, type BattlePageState } from "./BattleStateMachine";
import { boardStateChecksum } from "../sync/BoardStateChecksum";

export interface BattleControllerSnapshot { readonly state: BattlePageState; readonly gameConnectionState: BattleConnectionState; readonly aiConnectionState: string; readonly countdownMs: number; readonly reconnectDeadlineAt: number | null; readonly score: number; readonly combo: number; readonly opponentCombo: number; readonly maxCombo: number; readonly removedCount: number; readonly targetSymbol: string | null; readonly prediction: { readonly symbol: string; readonly confidence: number } | null; readonly message: string; readonly result: MatchFinishedEvent | null; }
export interface BattleControllerOptions { readonly playerId: string; readonly roomId: string; readonly initialMatchId?: string; readonly transport: BattleGameTransport; readonly localBoard: BattleLocalBoard; readonly remoteBoard: RemoteBoard; readonly attackEffect: BattleAttackEffect; readonly recognizer?: SignRecognizer; readonly sharedTargetMode?: boolean; readonly reconnectIntervalMs?: number; readonly reconnectGraceMs?: number; readonly onMatchStarted?: (matchId: string) => void; readonly onSharedTargetClaimed?: (event: SharedTargetClaimedEvent) => void; readonly onComboUpdated?: (event: ComboUpdatedEvent) => void; readonly onHammerAttack?: (event: HammerAttackEvent) => void; readonly onPlayerProfileUpdated?: (event: PlayerProfileUpdatedEvent) => void; readonly now?: () => number; readonly setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>; readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void; readonly createCommandId?: () => string; }

export class BattleController {
  private readonly machine = new BattleStateMachine(); private readonly listeners = new Set<(snapshot: BattleControllerSnapshot) => void>();
  private readonly now: () => number; private readonly setTimer: NonNullable<BattleControllerOptions["setTimer"]>; private readonly clearTimer: NonNullable<BattleControllerOptions["clearTimer"]>; private readonly createCommandId: () => string;
  private transportUnsubscribe: (() => void) | null = null; private transportStateUnsubscribe: (() => void) | null = null; private recognizerUnsubscribe: (() => void) | null = null; private startTimer: ReturnType<typeof setTimeout> | null = null; private startDeadlineAt: number | null = null; private reconnectTimer: ReturnType<typeof setTimeout> | null = null; private graceTimer: ReturnType<typeof setTimeout> | null = null; private readonly pendingSpawnTimers = new Set<ReturnType<typeof setTimeout>>(); private readonly pendingHammerTimers = new Set<ReturnType<typeof setTimeout>>();
  private connectionOptions: BattleConnectionOptions | null = null; private matchId: string | null = null; private runtimeMatchId: string | null = null; private opponentPlayerId: string | null = null; private gameConnectionState: BattleConnectionState = "DISCONNECTED"; private aiConnectionState = "DISCONNECTED"; private reconnectDeadlineAt: number | null = null; private countdownMs = 0; private score = 0; private combo = 0; private opponentCombo = 0; private maxCombo = 0; private removedCount = 0; private sharedTargetId: string | null = null; private sharedTargetSymbol: string | null = null; private sharedTargetReceivedAt = Number.NEGATIVE_INFINITY; private wrongReportedTargetId: string | null = null; private pendingTargetId: string | null = null; private pendingLetterId: string | null = null; private prediction: BattleControllerSnapshot["prediction"] = null; private lastPredictionPublishedAt = Number.NEGATIVE_INFINITY; private message = "Waiting for server start."; private result: MatchFinishedEvent | null = null; private disposed = false; private gameOverReported = false; private awaitingResumeOwnBoard = false; private peerRecoveryObserved = false; private lastRemoteBoardSnapshot: BoardSnapshotEvent | null = null;
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
  submitRecognizedSymbol(symbol: string, confidence = 1, confirmedAt = this.now()): boolean { if (this.machine.getState() !== "PLAYING" || !this.matchId) return false;
    if (this.options.sharedTargetMode) {
      if (!this.sharedTargetId || !this.sharedTargetSymbol) return false;
      if (confirmedAt < this.sharedTargetReceivedAt) return false;
      if (symbol !== this.sharedTargetSymbol) {
        // Recognition can briefly report a different sign, so only a won
        // shared-target round is allowed to mutate the authoritative combo.
        if (this.wrongReportedTargetId === this.sharedTargetId) return false;
        this.wrongReportedTargetId = this.sharedTargetId;
        this.message = `목표 글자 ${this.sharedTargetSymbol}를 먼저 맞혀보세요.`; this.publish(); return false;
      }
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
  handleRecognition(event: SignRecognitionEvent): void { if (event.type === "CONNECTION_STATE") { this.aiConnectionState = event.state; this.publish(); } else if (event.type === "PREDICTION") { this.prediction = { symbol: event.symbol, confidence: event.confidence }; const at=this.now(); if(at-this.lastPredictionPublishedAt>=100){this.lastPredictionPublishedAt=at;this.publish();} } else if (event.type === "SIGN_CONFIRMED") this.submitRecognizedSymbol(event.symbol, event.confidence, event.confirmedAt); }
  snapshot(): BattleControllerSnapshot { return { state: this.machine.getState(), gameConnectionState: this.gameConnectionState, aiConnectionState: this.aiConnectionState, countdownMs: this.countdownMs, reconnectDeadlineAt: this.reconnectDeadlineAt, score: this.score, combo: this.combo, opponentCombo: this.opponentCombo, maxCombo: this.maxCombo, removedCount: this.removedCount, targetSymbol: this.options.sharedTargetMode ? this.sharedTargetSymbol : this.options.localBoard.getTargetSymbol(), prediction: this.prediction, message: this.message, result: this.result }; }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.clearReconnectTimers(); this.clearStartTimer(); for (const timer of this.pendingSpawnTimers) this.clearTimer(timer); this.pendingSpawnTimers.clear(); for (const timer of this.pendingHammerTimers) this.clearTimer(timer); this.pendingHammerTimers.clear(); this.transportUnsubscribe?.(); this.transportStateUnsubscribe?.(); this.recognizerUnsubscribe?.(); this.options.transport.disconnect(); this.options.recognizer?.disconnect(); this.options.localBoard.dispose(); this.options.remoteBoard.clear(); this.options.attackEffect.dispose(); this.listeners.clear(); }
  private handleServer(message: ServerBattleMessage): void {
    // MATCH_FINISHED is terminal for a mounted game page. Late recovery/start
    // snapshots from signaling must not resurrect PLAYING and erase the result.
    const isMatchStart = message.type === "START_MATCH" || message.type === "MATCH_STARTED" || message.type === "GAME_START";
    // A distinct, non-recovery match may begin in the same room after both
    // players return to the waiting screen. All late messages from the old
    // match remain ignored, while the new match is allowed to reset the board.
    if (this.result && !(isMatchStart && !message.resume && message.matchId !== this.result.matchId)) return;
    if (isMatchStart) {
      this.opponentPlayerId = message.playerIds.find((playerId) => playerId !== this.options.playerId) ?? null;
    }
    if (isMatchStart) {
      const currentState = this.machine.getState();
      if (!message.resume && this.matchId === message.matchId && (currentState === "COUNTDOWN" || currentState === "PLAYING")) return;
      if (!message.resume && this.runtimeMatchId !== message.matchId) this.resetForFreshMatch();
      this.matchId = message.matchId;
      this.gameOverReported = false;

      if (message.resume && message.resumePlayerId && message.resumePlayerId !== this.options.playerId) {
        // Recovery messages share the data channel. The player who stayed in
        // the match must not rewind its live Matter.js world.
        return;
      }

      this.sharedTargetId = message.sharedTarget?.targetId ?? null;
      this.sharedTargetSymbol = message.sharedTarget?.symbol ?? null;
      this.sharedTargetReceivedAt = this.sharedTargetId ? this.now() : Number.NEGATIVE_INFINITY;
      this.wrongReportedTargetId = null;
      this.pendingTargetId = null;
      this.pendingLetterId = null;
      const ownState = message.playerStates?.find((state) => state.playerId === this.options.playerId);
      const opponentState = message.playerStates?.find((state) => state.playerId !== this.options.playerId);
      if (ownState) {
        this.score = ownState.score;
        this.combo = ownState.combo;
        this.maxCombo = ownState.maxCombo;
        this.removedCount = ownState.removedCount;
      }
      if (opponentState) this.opponentCombo = opponentState.combo;

      this.ensureMatchRuntime(message.matchId);
      this.options.recognizer?.resetRecognitionSession?.();
      if (message.resume) {
        this.clearReconnectTimers();
        this.reconnectDeadlineAt = null;
        this.clearStartTimer();
        this.countdownMs = 0;
        this.awaitingResumeOwnBoard = true;
        this.options.localBoard.stop();
        this.message = "Restoring the latest board snapshot...";
        this.transition("RECONNECTING");
        return;
      }

      const startAt = message.startAt;
      const serverNow = message.serverTime ?? this.now();
      const delay = Math.max(0, startAt - serverNow);
      this.countdownMs = delay;
      this.message = "Match countdown started.";
      this.transition("COUNTDOWN");
      this.startDeadlineAt = this.now() + delay;
      this.scheduleStartTick();
      return;
    }
    if (message.type === "SHARED_TARGET") { this.sharedTargetId = message.targetId; this.sharedTargetSymbol = message.symbol; this.sharedTargetReceivedAt = this.now(); this.wrongReportedTargetId = null; this.pendingTargetId = null; this.prediction = null; this.options.recognizer?.resetRecognitionSession?.(); this.message = `${message.symbol}를 먼저 맞혀보세요.`; this.publish(); return; }
    if (message.type === "SHARED_TARGET_CLAIMED") { if (message.targetId !== this.sharedTargetId) return; this.options.onSharedTargetClaimed?.(message); this.sharedTargetId = null; this.sharedTargetSymbol = null; this.sharedTargetReceivedAt = Number.NEGATIVE_INFINITY; this.wrongReportedTargetId = null; this.pendingTargetId = null; if (message.winnerPlayerId === this.options.playerId) { this.score = message.score; this.combo = message.combo; this.maxCombo = message.maxCombo; this.removedCount = message.removedCount; this.message = `${message.symbol} 선점 성공!`; } else { this.opponentCombo = message.combo; this.message = `상대가 ${message.symbol}를 먼저 맞혔습니다.`; } this.publish(); return; }
    if (message.type === "SPAWN_LETTER") { this.scheduleSpawn(message); return; }
    if (message.type === "REMOVE_LETTER_ACCEPTED") { if (message.playerId !== this.options.playerId) return; this.pendingLetterId = null; this.options.localBoard.acceptRemoval(message.letterId); this.score = message.score; this.combo = message.combo; this.maxCombo = message.maxCombo; this.removedCount = message.removedCount; this.message = `${message.symbol} accepted.`; this.publish(); return; }
    if (message.type === "REMOVE_LETTER_REJECTED") { this.pendingLetterId = null; this.options.localBoard.rejectRemoval(message.letterId); this.message = message.message; this.publish(); return; }
    if (message.type === "SCORE_UPDATED") { if (message.playerId === this.options.playerId) { this.score = message.score; this.publish(); } return; }
    if (message.type === "COMBO_UPDATED") { if (message.playerId === this.options.playerId) { this.combo = message.combo; this.maxCombo = message.maxCombo; } else this.opponentCombo = message.combo; this.options.onComboUpdated?.(message); this.publish(); return; }
    if (message.type === "PLAYER_PROFILE_UPDATED") { this.options.onPlayerProfileUpdated?.(message); return; }
    if (message.type === "HAMMER_ATTACK") { this.scheduleHammerAttack(message); return; }
    if (message.type === "ATTACK_CREATED" || message.type === "ATTACK_APPLIED") { if (message.targetPlayerId === this.options.playerId) this.options.attackEffect.apply(message as AttackCreatedEvent); return; }
    if (message.type === "MATCH_FINISHED") { this.result = message; this.options.localBoard.stop(); this.message = "Match finished."; this.transition("FINISHED"); return; }
    if (message.type === "PLAYER_DISCONNECTED") { if (message.playerId !== this.options.playerId) this.continueDuringPeerReconnect(true); return; }
    if (message.type === "PLAYER_RECONNECTED") { this.clearReconnectTimers(); this.reconnectDeadlineAt = null; this.message = this.awaitingResumeOwnBoard ? "Connected. Restoring the latest board snapshot..." : "Opponent reconnected."; if (this.machine.getState() === "RECONNECTING" && !this.awaitingResumeOwnBoard) this.transition("PLAYING"); else this.publish(); return; }
    if (message.type === "BOARD_SNAPSHOT" && message.playerId === this.options.playerId) {
      if (message.restoreForPlayerId && message.restoreForPlayerId !== this.options.playerId) return;
      if (message.boardChecksum && message.boardChecksum !== boardStateChecksum(message.bodies)) {
        this.requestMatchState();
        return;
      }
      this.options.localBoard.restore?.(message.bodies, message.sentAt, this.now());
      if (this.awaitingResumeOwnBoard) {
        this.awaitingResumeOwnBoard = false;
        try {
          this.options.localBoard.start();
          this.message = "Match state restored.";
          this.transition("PLAYING");
        } catch (cause) {
          this.message = cause instanceof Error ? `Board start failed: ${cause.message}` : "Board start failed.";
          this.transition("ERROR");
        }
      }
      return;
    }
    if ("playerId" in message && message.playerId !== this.options.playerId) {
      if (message.type === "BOARD_SNAPSHOT" && message.restoreForPlayerId && message.restoreForPlayerId !== this.options.playerId) return;
      if (message.type === "BOARD_SNAPSHOT") this.lastRemoteBoardSnapshot = message;
      const applied = this.options.remoteBoard.apply(message as RemoteSyncMessage, this.now());
      if (!applied && this.options.remoteBoard.consumeIntegrityFailure?.()) {
        this.requestMatchState();
        return;
      }
      if (message.type === "BOARD_SNAPSHOT") { this.clearReconnectTimers(); this.reconnectDeadlineAt = null; }
      if (message.type === "BOARD_SNAPSHOT" && this.machine.getState() === "RECONNECTING" && !this.awaitingResumeOwnBoard) { this.clearReconnectTimers(); this.reconnectDeadlineAt = null; this.options.localBoard.start(); this.message = "Match state restored."; this.transition("PLAYING"); }
    }
  }
  private handleTransportState(state: BattleConnectionState): void {
    this.gameConnectionState = state;
    const matchState = this.machine.getState();
    if ((state === "DISCONNECTED" || state === "ERROR") && (matchState === "PLAYING" || matchState === "COUNTDOWN" || matchState === "RECONNECTING")) {
      this.peerRecoveryObserved = true;
      this.continueDuringPeerReconnect(false);
    }
    if (state === "CONNECTED" && this.peerRecoveryObserved && this.matchId && this.lastRemoteBoardSnapshot) {
      const observed = this.lastRemoteBoardSnapshot;
      const now = this.now();
      const currentBodies = this.options.remoteBoard.snapshotBodies?.(now);
      this.options.transport.send({ type: "PEER_BOARD_VIEW", commandId: this.createCommandId(), matchId: this.matchId, observerPlayerId: this.options.playerId, subjectPlayerId: observed.playerId, sentAt: currentBodies ? now : observed.sentAt, bodies: currentBodies ?? observed.bodies });
      this.peerRecoveryObserved = false;
    }
    this.publish();
  }
  private scheduleHammerAttack(message: HammerAttackEvent): void {
    this.options.onHammerAttack?.(message);
    this.message = message.attackerPlayerId === this.options.playerId ? "HAMMER ATTACK!" : "상대의 망치 공격!";
    if (!message.victimLetterId || !message.transferredLetterId || !message.symbol) { this.publish(); return; }
    this.scheduleHammerStep(message.impactAt - message.createdAt, () => {
      if (message.defenderPlayerId === this.options.playerId) this.options.localBoard.takeLetterForOtter(message.victimLetterId!);
      else this.options.remoteBoard.removeLetter(message.victimLetterId!);
    });
    this.scheduleHammerStep(message.spawnAt - message.createdAt, () => {
      const spawn: Extract<ServerBattleMessage, { type: "SPAWN_LETTER" }> = {
        type: "SPAWN_LETTER",
        sequence: message.sequence,
        matchId: message.matchId,
        playerId: message.attackerPlayerId,
        letterId: message.transferredLetterId!,
        spawnIndex: message.sequence,
        symbol: message.symbol!,
        spawnAt: message.spawnAt,
        normalizedX: .5,
        normalizedY: .13,
        initialAngle: 0,
      };
      if (message.attackerPlayerId === this.options.playerId) this.options.localBoard.spawn(spawn);
      else this.options.remoteBoard.spawn(spawn, this.now());
    });
    this.publish();
  }
  private scheduleHammerStep(delayMs: number, callback: () => void): void {
    // P2P peers can have different system clocks. Event-relative durations
    // keep the Matter.js transfer aligned with the local sprite animation.
    const timer = this.setTimer(() => { this.pendingHammerTimers.delete(timer); if (!this.disposed) callback(); }, Math.max(0, delayMs));
    this.pendingHammerTimers.add(timer);
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
  private continueDuringPeerReconnect(opponentDisconnectConfirmed: boolean): void {
    if (this.disposed || !this.connectionOptions || !this.matchId) return;
    // The player who remains must keep their local physics board and input
    // active. Only the returning browser restores a snapshot; the active
    // browser retries the channel in the background without a countdown.
    this.message = "Opponent reconnecting. Game continues.";
    if (opponentDisconnectConfirmed && this.reconnectDeadlineAt === null) {
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
      const needsHydration = this.machine.getState() === "RECONNECTING";
      await this.options.transport.connect(this.connectionOptions);
      if (needsHydration) {
        this.options.transport.send({ type: "PLAYER_RECONNECTED", commandId: this.createCommandId(), matchId: this.matchId, occurredAt: this.now() });
        this.requestMatchState();
      }
      this.message = needsHydration ? "Connected. Restoring the latest board snapshot..." : "Connection restored. Game continues.";
      this.publish();
    } catch { this.message = "Reconnect attempt failed. Retrying..."; this.publish(); this.scheduleReconnect(); }
  }
  private clearReconnectTimers(): void { if (this.reconnectTimer) this.clearTimer(this.reconnectTimer); if (this.graceTimer) this.clearTimer(this.graceTimer); this.reconnectTimer = null; this.graceTimer = null; }
  private clearStartTimer(): void { if (this.startTimer) this.clearTimer(this.startTimer); this.startTimer = null; this.startDeadlineAt = null; }
  private resetForFreshMatch(): void {
    this.clearReconnectTimers();
    this.clearStartTimer();
    for (const timer of this.pendingSpawnTimers) this.clearTimer(timer);
    this.pendingSpawnTimers.clear();
    for (const timer of this.pendingHammerTimers) this.clearTimer(timer);
    this.pendingHammerTimers.clear();
    this.options.localBoard.reset();
    this.options.remoteBoard.clear();
    this.result = null;
    this.gameOverReported = false;
    this.awaitingResumeOwnBoard = false;
    this.peerRecoveryObserved = false;
    this.lastRemoteBoardSnapshot = null;
    this.score = 0;
    this.combo = 0;
    this.opponentCombo = 0;
    this.maxCombo = 0;
    this.removedCount = 0;
    this.sharedTargetId = null;
    this.sharedTargetSymbol = null;
    this.sharedTargetReceivedAt = Number.NEGATIVE_INFINITY;
    this.wrongReportedTargetId = null;
    this.pendingTargetId = null;
    this.pendingLetterId = null;
    this.prediction = null;
  }
  private ensureMatchRuntime(matchId: string): void {
    if (this.runtimeMatchId === matchId) return;
    this.runtimeMatchId = matchId;
    this.options.onMatchStarted?.(matchId);
  }
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
    this.message = "Finish line reached. Confirming your win...";
    this.options.transport.send({ type: "PLAYER_GAME_OVER_COMMAND", commandId: this.createCommandId(), matchId: this.matchId, occurredAt: this.now() });
    this.publish();
  }
  private transition(next: BattlePageState): void { this.machine.transition(next); this.publish(); }
  private publish(): void { const snapshot = this.snapshot(); for (const listener of this.listeners) listener(snapshot); }
}
