import type { LineRaceClock } from "./LineRaceClock";
import type { LineRaceRuntimeConfig } from "./LineRaceRuntimeConfig";
import { LineRaceStateMachine, type LineRaceRuntimeState } from "./LineRaceStateMachine";
import { LocalRaceProgressModel, type RaceProgressSnapshot } from "./RaceProgressModel";
import {
  JamoObstacleSystem,
  type JamoObstacleTemplate,
  type LocalJamoObstacleSnapshot,
} from "../obstacle";

export const LINE_RACE_DEV_PLAYERS = ["PLAYER_A", "PLAYER_B"] as const;
export type LineRaceDevPlayerId = (typeof LINE_RACE_DEV_PLAYERS)[number];

export interface LineRaceRuntimeSnapshot {
  readonly state: LineRaceRuntimeState;
  readonly now: number;
  readonly simulationNow: number;
  readonly remainingMs: number;
  readonly players: readonly {
    readonly playerId: string;
    readonly displayName?: string;
    readonly progress: number;
    readonly state: "RUNNING" | "TRAVERSING" | "FINISHED";
    readonly accumulatedPenaltyMs: number;
  }[];
  readonly winnerPlayerId?: string;
  readonly obstacles: readonly LocalJamoObstacleSnapshot[];
}

export interface SpawnRuntimeObstacleOptions {
  readonly symbol: string;
  readonly targetPlayerId: LineRaceDevPlayerId;
  readonly coursePosition?: number;
  readonly warningDurationMs?: number;
  readonly fallDurationMs?: number;
  readonly penaltyMs?: number;
}

export interface LineRaceRuntime {
  start(startAt: number): void;
  update(now: number): void;
  pause(): void;
  resume(): void;
  reset(): void;
  finish(): void;
  getSnapshot(): LineRaceRuntimeSnapshot;
  subscribe(listener: (snapshot: LineRaceRuntimeSnapshot) => void): () => void;
  dispose(): void;
}

export class LocalLineRaceRuntime implements LineRaceRuntime {
  private readonly stateMachine = new LineRaceStateMachine();
  private readonly progressModel: LocalRaceProgressModel;
  private readonly listeners = new Set<(snapshot: LineRaceRuntimeSnapshot) => void>();
  private startAt = 0;
  private lastNow: number;
  private pausedAt: number | null = null;
  private totalPausedMs = 0;
  private stateBeforePause: Extract<LineRaceRuntimeState, "COUNTDOWN" | "PLAYING"> = "PLAYING";
  private winnerPlayerId: string | undefined;
  private disposed = false;
  private readonly obstacleSystem = new JamoObstacleSystem();

  constructor(
    readonly config: LineRaceRuntimeConfig,
    private readonly clock: LineRaceClock,
    readonly playerIds: readonly LineRaceDevPlayerId[] = LINE_RACE_DEV_PLAYERS,
  ) {
    this.lastNow = clock.now();
    this.progressModel = new LocalRaceProgressModel(playerIds, config);
  }

  start(startAt: number): void {
    this.assertActive();
    assertNow(startAt);
    this.progressModel.start(startAt);
    this.startAt = startAt;
    this.lastNow = this.clock.now();
    this.pausedAt = null;
    this.totalPausedMs = 0;
    this.winnerPlayerId = undefined;
    this.obstacleSystem.clear();
    if (this.stateMachine.getState() !== "IDLE") this.stateMachine.reset();
    this.stateMachine.transition("COUNTDOWN");
    this.publish();
  }

  update(now: number): void {
    this.assertActive();
    assertNow(now);
    if (now < this.lastNow) throw new RangeError("Line-race time cannot move backwards.");
    this.lastNow = now;
    const state = this.stateMachine.getState();
    if (state === "IDLE" || state === "PAUSED" || state === "FINISHED") return;

    const effectiveNow = this.effectiveNow(now);
    if (state === "COUNTDOWN" && effectiveNow >= this.startAt) {
      this.stateMachine.transition("PLAYING");
    }
    if (this.stateMachine.getState() !== "PLAYING") {
      this.updateObstacles(effectiveNow);
      this.publish();
      return;
    }

    this.updateObstacles(effectiveNow);
    const players = this.playerSnapshots(effectiveNow);
    const finishers = players.filter((player) => player.progress >= this.config.raceLength);
    if (finishers.length > 0) {
      this.completeByRanking(finishers.length === 1 ? finishers[0]?.playerId : undefined, effectiveNow);
      return;
    }
    if (effectiveNow >= this.finishDeadline()) {
      this.finish();
      return;
    }
    this.publish();
  }

  pause(): void {
    this.assertActive();
    const state = this.stateMachine.getState();
    if (state !== "COUNTDOWN" && state !== "PLAYING") return;
    const now = this.clock.now();
    this.update(now);
    if (this.stateMachine.getState() === "FINISHED") return;
    this.stateBeforePause = this.stateMachine.getState() as typeof this.stateBeforePause;
    this.pausedAt = now;
    this.stateMachine.transition("PAUSED");
    this.publish();
  }

  resume(): void {
    this.assertActive();
    if (this.stateMachine.getState() !== "PAUSED" || this.pausedAt === null) return;
    const now = this.clock.now();
    if (now < this.pausedAt) throw new RangeError("Line-race time cannot move backwards.");
    this.totalPausedMs += now - this.pausedAt;
    this.pausedAt = null;
    this.lastNow = now;
    this.stateMachine.transition(this.stateBeforePause);
    this.publish();
  }

  reset(): void {
    this.assertActive();
    this.progressModel.reset();
    this.stateMachine.reset();
    this.startAt = 0;
    this.lastNow = this.clock.now();
    this.pausedAt = null;
    this.totalPausedMs = 0;
    this.winnerPlayerId = undefined;
    this.obstacleSystem.clear();
    this.publish();
  }

  finish(): void {
    this.assertActive();
    const state = this.stateMachine.getState();
    if (state === "IDLE" || state === "FINISHED") return;
    const effectiveNow = this.effectiveNow(this.lastNow);
    const [left, right] = this.playerSnapshots(effectiveNow);
    let winner: string | undefined;
    if (left && right) {
      if (left.progress !== right.progress) winner = left.progress > right.progress ? left.playerId : right.playerId;
      else if (left.accumulatedPenaltyMs !== right.accumulatedPenaltyMs) {
        winner = left.accumulatedPenaltyMs < right.accumulatedPenaltyMs ? left.playerId : right.playerId;
      }
    }
    this.completeByRanking(winner, effectiveNow);
  }

  addProgress(playerId: LineRaceDevPlayerId, amount: number): void {
    this.assertPlayingOrCountdown();
    const effectiveNow = this.effectiveNow(this.lastNow);
    this.progressModel.addProgress(playerId, amount, effectiveNow);
    this.update(this.lastNow);
  }

  applyPenalty(playerId: LineRaceDevPlayerId, penaltyMs: number): void {
    this.assertPlayingOrCountdown();
    const effectiveNow = this.effectiveNow(this.lastNow);
    this.progressModel.getProgress(playerId, effectiveNow);
    this.progressModel.applyPenalty(playerId, penaltyMs);
    this.publish();
  }

  setTraversing(playerId: LineRaceDevPlayerId, durationMs: number): void {
    this.assertPlayingOrCountdown();
    const effectiveNow = this.effectiveNow(this.lastNow);
    this.progressModel.setTraversing(playerId, effectiveNow, durationMs);
    this.publish();
  }

  forceWinner(playerId: LineRaceDevPlayerId): void {
    this.assertPlayingOrCountdown();
    const effectiveNow = this.effectiveNow(this.lastNow);
    this.progressModel.finishPlayer(playerId, effectiveNow);
    this.completeByRanking(playerId, effectiveNow);
  }

  spawnObstacle(options: SpawnRuntimeObstacleOptions): LocalJamoObstacleSnapshot {
    this.assertPlayingOrCountdown();
    const effectiveNow = this.effectiveNow(this.lastNow);
    const player = this.progressModel.getPlayerSnapshot(options.targetPlayerId, effectiveNow);
    const snapshot = this.obstacleSystem.spawn({
      ...options,
      playerProgress: player.progress,
      raceLength: this.config.raceLength,
      now: effectiveNow,
    });
    this.publish();
    return snapshot;
  }

  counterObstacle(obstacleId: string): boolean {
    this.assertPlayingOrCountdown();
    const result = this.obstacleSystem.counter(obstacleId, this.effectiveNow(this.lastNow));
    if (result) this.publish();
    return result;
  }

  counterNearestObstacle(playerId: LineRaceDevPlayerId, symbol: string): string | null {
    this.assertPlayingOrCountdown();
    const effectiveNow = this.effectiveNow(this.lastNow);
    const progress = this.progressModel.getProgress(playerId, effectiveNow);
    const obstacleId = this.obstacleSystem.counterNearest(playerId, symbol, progress, effectiveNow);
    if (obstacleId) this.publish();
    return obstacleId;
  }

  forceObstacleTraversal(obstacleId: string): boolean {
    this.assertPlayingOrCountdown();
    const effectiveNow = this.effectiveNow(this.lastNow);
    const candidate = this.obstacleSystem.getSnapshots(effectiveNow).find((item) => item.obstacleId === obstacleId);
    if (!candidate || this.progressModel.getPlayerSnapshot(candidate.targetPlayerId, effectiveNow).state !== "RUNNING") return false;
    const obstacle = this.obstacleSystem.forceTraversal(obstacleId, effectiveNow);
    if (!obstacle) return false;
    this.progressModel.setTraversing(obstacle.targetPlayerId, effectiveNow, obstacle.penaltyMs);
    this.publish();
    return true;
  }

  removeAllObstacles(): void {
    this.assertActive();
    this.obstacleSystem.removeAll(this.effectiveNow(this.lastNow));
    this.publish();
  }

  getObstacleTemplates(): readonly JamoObstacleTemplate[] {
    return this.obstacleSystem.registry.getAll();
  }

  getSnapshot(): LineRaceRuntimeSnapshot {
    const state = this.stateMachine.getState();
    const effectiveNow = this.effectiveNow(this.lastNow);
    const players = state === "IDLE"
      ? this.playerIds.map((playerId) => ({ playerId, progress: 0, state: "RUNNING" as const, accumulatedPenaltyMs: 0 }))
      : this.playerSnapshots(effectiveNow).map(({ finishedAt: _finishedAt, ...player }) => player);
    const remainingMs = state === "IDLE"
      ? this.config.matchDurationMs
      : Math.max(0, this.finishDeadline() - Math.max(this.startAt, effectiveNow));
    return {
      state,
      now: this.lastNow,
      simulationNow: effectiveNow,
      remainingMs,
      players,
      obstacles: state === "IDLE" ? [] : this.obstacleSystem.getSnapshots(effectiveNow),
      ...(this.winnerPlayerId === undefined ? {} : { winnerPlayerId: this.winnerPlayerId }),
    };
  }

  subscribe(listener: (snapshot: LineRaceRuntimeSnapshot) => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.listeners.clear();
    this.obstacleSystem.dispose();
    this.disposed = true;
  }

  private playerSnapshots(now: number): readonly RaceProgressSnapshot[] {
    return this.playerIds.map((playerId) => this.progressModel.getPlayerSnapshot(playerId, now));
  }

  private updateObstacles(now: number): void {
    const players = this.playerSnapshots(now);
    this.obstacleSystem.update(now, players, (playerId, obstacle) => {
      this.progressModel.setTraversing(playerId, now, obstacle.penaltyMs);
    });
  }

  private completeByRanking(winnerPlayerId: string | undefined, finishedAt: number): void {
    if (this.stateMachine.getState() !== "FINISHED") this.stateMachine.transition("FINISHED");
    this.winnerPlayerId = winnerPlayerId;
    if (winnerPlayerId) this.progressModel.finishPlayer(winnerPlayerId, finishedAt);
    this.publish();
  }

  private finishDeadline(): number {
    return this.startAt + this.config.matchDurationMs;
  }

  private effectiveNow(now: number): number {
    const currentPause = this.pausedAt === null ? 0 : Math.max(0, now - this.pausedAt);
    return now - this.totalPausedMs - currentPause;
  }

  private publish(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertPlayingOrCountdown(): void {
    this.assertActive();
    const state = this.stateMachine.getState();
    if (state !== "PLAYING" && state !== "COUNTDOWN") {
      throw new Error(`Line-race control is unavailable while ${state}.`);
    }
  }

  private assertActive(): void {
    if (this.disposed) throw new Error("Line-race runtime has been disposed.");
  }
}

function assertNow(value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError("Line-race time must be a finite non-negative number.");
}
