import type {
  LineRaceServerEvent,
  LineRaceMatchConfig,
  LineRaceMatchSnapshot,
  LineRaceObstacle,
  LineRaceMatchFinishedEvent,
} from "../contracts";
import type { LineRaceRuntimeSnapshot } from "./LineRaceRuntime";
import type { LineRaceRuntimeConfig } from "./LineRaceRuntimeConfig";
import type {
  LocalJamoObstacleSnapshot,
  LocalJamoObstacleState,
} from "../obstacle";
import { createDefaultJamoObstacleRegistry } from "../obstacle";
import {
  LineRaceClientStateMachine,
  type LineRaceClientState,
} from "./LineRaceClientStateMachine";
import { LineRaceInterpolationBuffer } from "./LineRaceInterpolationBuffer";
import type { LineRaceServerClock } from "./LineRaceServerClock";
import { COMPETITIVE_RECOGNITION_SYMBOLS, isCompetitiveRecognitionReady } from "../../recognition/readiness/recognitionReadiness";

export interface NetworkLineRaceView {
  synchronized: boolean;
  clientState: LineRaceClientState;
  hand: readonly string[];
  combo: number;
  lastError: string | null;
  lastSequence: number;
  render: LineRaceRuntimeSnapshot;
  finished: LineRaceMatchFinishedEvent | null;
  raceLength: number;
}
export class NetworkLineRaceController {
  private readonly state = new LineRaceClientStateMachine();
  private readonly listeners = new Set<(view: NetworkLineRaceView) => void>();
  private readonly progress = new Map<string, LineRaceInterpolationBuffer>();
  private readonly players = new Map<
    string,
    {
      progress: number;
      state: "RUNNING" | "TRAVERSING" | "FINISHED";
      accumulatedPenaltyMs: number;
    }
  >();
  private readonly obstacles = new Map<string, LineRaceObstacle>();
  private readonly counteredAt = new Map<string, number>();
  private readonly registry = createDefaultJamoObstacleRegistry();
  private config: LineRaceMatchConfig | null = null;
  private runtimeConfig: LineRaceRuntimeConfig = {
    raceLength: 1000, baseSpeedPerSecond: 28, matchDurationMs: 60000, countdownMs: 3000,
  };
  private hand: string[] = [];
  private combo = 0;
  private lastError: string | null = null;
  private sequence = -1;
  private startAt = 0;
  private deadline = 0;
  private attackCooldownEndsAt = 0;
  private finished: LineRaceMatchFinishedEvent | null = null;
  private pausedRemainingMs: number | null = null;
  private pausedSimulationNow: number | null = null;
  private hasSnapshot = false;
  private readonly participantNames = new Map<string, string>();
  constructor(
    readonly matchId: string,
    readonly localPlayerId: string,
    private readonly clock: LineRaceServerClock,
    private readonly onSequenceGap?: () => void,
    participants: readonly { readonly playerId: string; readonly displayName: string }[] = [],
  ) { this.setParticipants(participants); }
  setParticipants(participants: readonly { readonly playerId: string; readonly displayName: string }[]) {
    for (const participant of participants) {
      const current = this.participantNames.get(participant.playerId);
      if (!current || participant.displayName !== participant.playerId)
        this.participantNames.set(participant.playerId, participant.displayName);
    }
  }
  connect() {
    const current = this.state.getState();
    if (current === "IDLE" || current === "ERROR") this.move("CONNECTING");
  }
  connectionLost() {
    if (this.state.getState() !== "FINISHED") {
      this.pausedRemainingMs = this.deadline ? Math.max(1, this.deadline - this.clock.now()) : this.runtimeConfig.matchDurationMs;
      this.pausedSimulationNow = this.clock.now();
      this.move("RECONNECTING");
      this.publish();
    }
  }
  waiting() {
    this.move("WAITING_START");
  }
  apply(event: LineRaceServerEvent) {
    if (event.matchId !== this.matchId) return false;
    if (!this.hasSnapshot && event.type !== "LINE_RACE_MATCH_SNAPSHOT") return false;
    if (event.type === "LINE_RACE_MATCH_FINISHED" && this.finished) return false;
    if (event.sequence <= this.sequence) return false;
    if (this.sequence >= 0 && event.sequence > this.sequence + 1)
      this.onSequenceGap?.();
    this.sequence = event.sequence;
    this.clock.updateOffset({
      serverTime:
        event.type === "LINE_RACE_PROGRESS_UPDATED"
          ? event.serverTime
          : event.occurredAt,
      clientReceivedAt: Date.now(),
    });
    switch (event.type) {
      case "LINE_RACE_MATCH_STARTED":
        this.setParticipants(event.players);
        this.setConfig(event.config);
        this.startAt = event.startAt;
        this.deadline = event.finishDeadlineAt;
        this.move("COUNTDOWN");
        break;
      case "LINE_RACE_HAND_DEALT":
        if (event.playerId === this.localPlayerId) this.hand = event.hand.filter(isCompetitiveRecognitionReady);
        break;
      case "LINE_RACE_ATTACK_ACCEPTED":
        if (event.attackerPlayerId === this.localPlayerId) {
          this.combo = event.combo;
          this.attackCooldownEndsAt = event.occurredAt + (this.config?.attackCooldownMs ?? 0);
        }
        if (isCompetitiveRecognitionReady(event.obstacle.symbol)) this.obstacles.set(event.obstacle.obstacleId, event.obstacle);
        break;
      case "LINE_RACE_ATTACK_REJECTED":
        this.lastError = event.reason;
        break;
      case "LINE_RACE_COUNTER_FAILED":
        this.lastError = event.reason;
        break;
      case "LINE_RACE_OBSTACLE_CREATED":
        if (isCompetitiveRecognitionReady(event.obstacle.symbol)) this.obstacles.set(event.obstacleId, event.obstacle);
        break;
      case "LINE_RACE_OBSTACLE_FALLING":
        this.patchObstacle(event.obstacleId, { status: "FALLING" });
        break;
      case "LINE_RACE_OBSTACLE_ACTIVATED":
        this.patchObstacle(event.obstacleId, {
          status: "ACTIVE",
          counterDeadlineAt: event.counterDeadlineAt,
        });
        break;
      case "LINE_RACE_COUNTER_SUCCEEDED":
        this.patchObstacle(event.obstacleId, { status: "COUNTERED" });
        this.counteredAt.set(event.obstacleId, event.counterAt);
        break;
      case "LINE_RACE_TRAVERSAL_STARTED":
        this.patchObstacle(event.obstacleId, {
          status: "TRAVERSING",
          traversalStartedAt: event.traversalStartedAt,
        });
        this.patchPlayer(event.playerId, { state: "TRAVERSING" });
        break;
      case "LINE_RACE_TRAVERSAL_FINISHED":
        this.obstacles.delete(event.obstacleId);
        this.patchPlayer(event.playerId, {
          state: "RUNNING",
          accumulatedPenaltyMs: event.accumulatedPenaltyMs,
        });
        break;
      case "LINE_RACE_OBSTACLE_REMOVED":
        this.obstacles.delete(event.obstacleId);
        this.counteredAt.delete(event.obstacleId);
        break;
      case "LINE_RACE_PROGRESS_UPDATED":
        if (this.state.getState() === "COUNTDOWN" && event.serverTime >= this.startAt) {
          if (!this.canEnterPlaying(event.serverTime)) {
            this.move("ERROR");
            break;
          }
          this.move("PLAYING");
        }
        if (this.state.getState() !== "PLAYING") break;
        for (const player of event.players) {
          this.patchPlayer(player.playerId, {
            progress: player.progress,
            state: player.state,
            accumulatedPenaltyMs: player.accumulatedPenaltyMs,
          });
          this.buffer(player.playerId).push(player.progress, event.serverTime);
        }
        break;
      case "LINE_RACE_MATCH_SNAPSHOT":
        this.applySnapshot(event.snapshot);
        break;
      case "LINE_RACE_MATCH_FINISHED":
        this.finished = event;
        for (const result of event.results)
          this.patchPlayer(result.playerId, {
            progress: result.finalProgress,
            accumulatedPenaltyMs: result.accumulatedPenaltyMs,
            state: "FINISHED",
          });
        for (const result of event.results)
          this.buffer(result.playerId).reset(result.finalProgress, event.finishedAt);
        this.move("FINISHED");
        this.pausedRemainingMs = null;
        this.pausedSimulationNow = event.finishedAt;
        break;
    }
    this.publish();
    return true;
  }
  applySnapshot(snapshot: LineRaceMatchSnapshot) {
    if (snapshot.matchId !== this.matchId)
      throw new Error("Snapshot matchId mismatch");
    this.clock.updateOffset({
      serverTime: snapshot.serverTime,
      clientReceivedAt: Date.now(),
    });
    this.setConfig(snapshot.config);
    this.startAt = snapshot.startAt ?? 0;
    this.deadline = snapshot.finishDeadlineAt ?? 0;
    this.hand = snapshot.myAttackHand.filter(isCompetitiveRecognitionReady);
    this.lastError = null;
    const activeSnapshot = snapshot.status === "COUNTDOWN" || snapshot.status === "PLAYING";
    if (snapshot.status === "WAITING" || snapshot.status === "CANCELLED") {
      this.rejectInitialSnapshot("서버가 아직 시작되지 않은 경기 상태를 보냈습니다.");
      return;
    }
    if (activeSnapshot && (!this.startAt || !this.deadline || this.deadline <= this.startAt)) {
      this.rejectInitialSnapshot("경기 시작 시간 또는 종료 시간이 올바르지 않습니다.");
      return;
    }
    if (activeSnapshot && (snapshot.players.length !== 2 || !snapshot.players.some(player => player.playerId === this.localPlayerId))) {
      this.rejectInitialSnapshot("사람과 봇을 포함한 참가자 두 명의 상태가 필요합니다.");
      return;
    }
    if (activeSnapshot && this.hand.length === 0) {
      this.rejectInitialSnapshot("서버가 현재 사용자에게 유효한 공격 패를 배정하지 않았습니다.");
      return;
    }
    if (snapshot.status === "PLAYING" && !this.canEnterPlaying(snapshot.serverTime)) {
      this.players.clear();
      this.progress.clear();
      this.obstacles.clear();
      this.move("ERROR");
      this.publish();
      return;
    }
    if (snapshot.status === "FINISHED" && !snapshot.result) {
      this.lastError = "종료된 경기의 서버 결과가 없습니다. 경기 상태를 다시 불러와 주세요.";
      this.move("ERROR");
      this.publish();
      return;
    }
    this.obstacles.clear();
    for (const obstacle of snapshot.obstacles)
      if (isCompetitiveRecognitionReady(obstacle.symbol) && !["COUNTERED", "TRAVERSED", "EXPIRED"].includes(obstacle.status))
        this.obstacles.set(obstacle.obstacleId, obstacle);
    for (const player of snapshot.players) {
      this.players.set(player.playerId, {
        progress: player.progress,
        state: player.state === "DISCONNECTED" ? "RUNNING" : player.state,
        accumulatedPenaltyMs: player.accumulatedPenaltyMs,
      });
      this.buffer(player.playerId).reset(player.progress, snapshot.serverTime);
      if (player.playerId === this.localPlayerId) this.combo = player.combo;
    }
    this.sequence = Math.max(this.sequence, snapshot.sequence);
    this.hasSnapshot = true;
    if (snapshot.status === "FINISHED" && snapshot.result) {
      this.finished = {
        type: "LINE_RACE_MATCH_FINISHED", eventId: `snapshot-${snapshot.sequence}`,
        matchId: snapshot.result.matchId, roomId: snapshot.result.roomId,
        sequence: snapshot.sequence, occurredAt: snapshot.result.finishedAt,
        winnerPlayerId: snapshot.result.winnerPlayerId, loserPlayerId: snapshot.result.loserPlayerId,
        finishReason: snapshot.result.finishReason, results: snapshot.result.results,
        startedAt: snapshot.result.startedAt, finishedAt: snapshot.result.finishedAt,
      };
    }
    this.pausedRemainingMs = null;
    this.pausedSimulationNow = snapshot.status === "FINISHED" ? snapshot.result?.finishedAt ?? snapshot.serverTime : null;
    this.move(
      snapshot.status === "COUNTDOWN"
        ? "COUNTDOWN"
        : snapshot.status === "PLAYING"
          ? "PLAYING"
          : snapshot.status === "FINISHED"
            ? "FINISHED"
            : "WAITING_START",
    );
    this.publish();
  }
  tick() {
    // Rendering follows server events/snapshots. A local clock never advances match state.
  }
  getView(): NetworkLineRaceView {
    const now = this.clock.now(),
      ids = [this.localPlayerId, ...this.players.keys()]
        .filter((id, index, array) => array.indexOf(id) === index)
        .slice(0, 2);
    while (ids.length < 2) ids.push(`REMOTE_${ids.length}`);
    const aliases = new Map([
      [ids[0], "PLAYER_A"],
      [ids[1], "PLAYER_B"],
    ]);
    const clientState = this.state.getState();
    const runtimeState =
      clientState === "COUNTDOWN"
        ? "COUNTDOWN"
        : clientState === "FINISHED"
          ? "FINISHED"
          : clientState === "PLAYING"
            ? "PLAYING"
            : clientState === "RECONNECTING"
              ? "PAUSED"
              : "IDLE";
    const renderPlayers = runtimeState === "IDLE" ? [] : ids.map((id) => {
      const value = this.players.get(id) ?? {
        progress: 0,
        state: "RUNNING" as const,
        accumulatedPenaltyMs: 0,
      };
      return {
        playerId: aliases.get(id)!,
        displayName: `${this.participantNames.get(id) ?? id} (${id === this.localPlayerId ? "나" : "상대"})`,
        progress: clientState === "PLAYING" ? this.buffer(id).valueAt(now) : value.progress,
        state: value.state,
        accumulatedPenaltyMs: value.accumulatedPenaltyMs,
      };
    });
    return {
      synchronized: this.hasSnapshot,
      clientState: this.state.getState(),
      hand: [...this.hand],
      combo: this.combo,
      lastError: this.lastError,
      lastSequence: this.sequence,
      finished: this.finished,
      raceLength: this.runtimeConfig.raceLength,
      render: {
        state: runtimeState,
        now,
        simulationNow: this.pausedSimulationNow ?? now,
        remainingMs: clientState === "FINISHED" || runtimeState === "IDLE"
          ? 0
          : clientState === "RECONNECTING" && this.pausedRemainingMs !== null
          ? this.pausedRemainingMs
          : this.deadline
          ? (clientState === "PLAYING" ? Math.max(1, this.deadline - now) : Math.max(0, this.deadline - now))
          : (this.config?.matchDurationMs ?? 0),
        players: renderPlayers,
        obstacles: runtimeState === "PLAYING" || runtimeState === "PAUSED" ? [...this.obstacles.values()].filter((o) => o.status !== "COUNTERED" || now - (this.counteredAt.get(o.obstacleId) ?? now) < 600).map((o) =>
          this.toLocalObstacle(
            o,
            aliases.get(o.targetPlayerId) ?? "PLAYER_B",
            this.pausedSimulationNow ?? now,
          ),
        ) : [],
        ...(this.finished?.winnerPlayerId
          ? {
              winnerPlayerId:
                this.finished.winnerPlayerId === this.localPlayerId
                  ? "PLAYER_A"
                  : "PLAYER_B",
            }
          : {}),
      },
    };
  }
  getConfig(): LineRaceRuntimeConfig {
    return this.runtimeConfig;
  }
  getInputContext() {
    const view = this.getView(),
      local = view.render.players[0] ?? { progress: 0 },
      pending = [...this.obstacles.values()].filter(
        (o) =>
          o.targetPlayerId !== this.localPlayerId &&
          !["COUNTERED", "TRAVERSED", "EXPIRED"].includes(o.status),
      );
    return {
      matchState:
        view.clientState === "PLAYING"
          ? ("PLAYING" as const)
          : view.clientState === "COUNTDOWN"
            ? ("COUNTDOWN" as const)
            : view.clientState === "FINISHED"
              ? ("FINISHED" as const)
              : ("IDLE" as const),
      attackHand: view.hand,
      attackCooldownEndsAt: this.attackCooldownEndsAt,
      now: this.clock.now(),
      pendingObstacleCount: pending.length,
      maxPendingObstacles: this.config?.maxPendingObstacles ?? 3,
      counterWindowMs: this.config?.counterWindowMs,
      supportedSymbols:
        (this.config?.supportedSymbols ?? COMPETITIVE_RECOGNITION_SYMBOLS).filter(isCompetitiveRecognitionReady),
      counterableObstacles: [...this.obstacles.values()]
        .filter(
          (o) =>
            o.targetPlayerId === this.localPlayerId &&
            ["WARNING", "FALLING", "ACTIVE"].includes(o.status) &&
            o.counterDeadlineAt >= this.clock.now(),
        )
        .map((o) => ({
          obstacleId: o.obstacleId,
          symbol: o.symbol,
          distanceToRunner: Math.max(0, o.coursePosition - local.progress),
          counterDeadlineAt: o.counterDeadlineAt,
          state: o.status as "WARNING" | "FALLING" | "ACTIVE",
        }))
        .sort((a, b) => a.distanceToRunner - b.distanceToRunner),
    };
  }
  subscribe(listener: (view: NetworkLineRaceView) => void) {
    this.listeners.add(listener);
    listener(this.getView());
    return () => this.listeners.delete(listener);
  }
  dispose() {
    this.listeners.clear();
    this.obstacles.clear();
    this.counteredAt.clear();
    this.players.clear();
    this.progress.clear();
  }
  private toLocalObstacle(
    o: LineRaceObstacle,
    targetPlayerId: string,
    now: number,
  ): LocalJamoObstacleSnapshot {
    const template =
      this.registry.getById(o.templateId) ??
      this.registry.getBySymbol(o.symbol);
    const fallDurationMs = template?.fallDurationMs ?? 600;
    const fallingStartedAt = o.warningEndsAt;
    const state = toLocalState(o.status);
    return {
      obstacleId: o.obstacleId,
      templateId: o.templateId,
      symbol: o.symbol,
      targetPlayerId,
      coursePosition: o.coursePosition,
      state,
      penaltyMs: o.penaltyMs,
      fallDurationMs,
      warningStartedAt: o.createdAt,
      warningEndsAt: o.warningEndsAt,
      ...(state !== "WARNING" ? { fallingStartedAt } : {}),
      ...(["ACTIVE", "TRAVERSING", "TRAVERSED"].includes(state)
        ? { activatedAt: fallingStartedAt + fallDurationMs }
        : {}),
      ...(o.traversalStartedAt === undefined
        ? {}
        : {
            traversalStartedAt: o.traversalStartedAt,
            traversalEndsAt: o.traversalStartedAt + o.penaltyMs,
          }),
      ...(["COUNTERED", "REMOVING"].includes(state)
        ? { removingStartedAt: now }
        : {}),
      fallProgress:
        state === "WARNING"
          ? 0
          : Math.min(1, Math.max(0, (now - fallingStartedAt) / fallDurationMs)),
      removalProgress: 0,
    };
  }
  private patchObstacle(id: string, patch: Partial<LineRaceObstacle>) {
    const value = this.obstacles.get(id);
    if (value) this.obstacles.set(id, { ...value, ...patch });
  }
  private patchPlayer(
    id: string,
    patch: Partial<{
      progress: number;
      state: "RUNNING" | "TRAVERSING" | "FINISHED";
      accumulatedPenaltyMs: number;
    }>,
  ) {
    const value = this.players.get(id) ?? {
      progress: 0,
      state: "RUNNING" as const,
      accumulatedPenaltyMs: 0,
    };
    this.players.set(id, { ...value, ...patch });
  }
  private buffer(id: string) {
    let value = this.progress.get(id);
    if (!value) {
      value = new LineRaceInterpolationBuffer();
      this.progress.set(id, value);
    }
    return value;
  }
  private move(next: LineRaceClientState) {
    if (this.state.getState() !== next) this.state.transition(next);
  }
  private setConfig(config: LineRaceMatchConfig) {
    this.config = config;
    this.runtimeConfig = {
      raceLength: config.raceLength, baseSpeedPerSecond: config.baseSpeedPerSecond,
      matchDurationMs: config.matchDurationMs, countdownMs: config.countdownMs,
    };
  }
  private canEnterPlaying(serverTime: number) {
    if (this.hand.length === 0) {
      this.lastError = "서버가 유효한 공격 패를 제공하지 않았습니다. 경기 상태를 다시 불러와 주세요.";
      return false;
    }
    if (!this.deadline || this.deadline <= serverTime) {
      this.lastError = "남은 시간이 없는 PLAYING 상태를 거부했습니다. 경기 상태를 다시 불러와 주세요.";
      return false;
    }
    return true;
  }
  private rejectInitialSnapshot(detail: string) {
    this.hasSnapshot = false;
    this.players.clear();
    this.progress.clear();
    this.obstacles.clear();
    this.lastError = `경기 시작 동기화 오류: ${detail} 경기 상태를 다시 불러와 주세요.`;
    this.move("ERROR");
    this.publish();
  }
  private publish() {
    const view = this.getView();
    this.listeners.forEach((listener) => listener(view));
  }
}
function toLocalState(
  status: LineRaceObstacle["status"],
): LocalJamoObstacleState {
  return status === "WARNING"
    ? "WARNING"
    : status === "FALLING"
      ? "FALLING"
      : status === "ACTIVE"
        ? "ACTIVE"
        : status === "COUNTERED"
          ? "COUNTERED"
          : status === "TRAVERSING"
            ? "TRAVERSING"
            : status === "TRAVERSED"
              ? "TRAVERSED"
              : "REMOVED";
}
