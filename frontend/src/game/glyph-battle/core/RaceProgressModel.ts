import type { LineRaceRunnerState } from "../contracts";
import type { LineRaceRuntimeConfig } from "./LineRaceRuntimeConfig";

export interface RaceProgressModel {
  getProgress(playerId: string, now: number): number;
  applyPenalty(playerId: string, penaltyMs: number): void;
  setTraversing(playerId: string, startedAt: number, durationMs: number): void;
  finishPlayer(playerId: string, finishedAt: number): void;
  reset(): void;
}

export interface RaceProgressSnapshot {
  readonly playerId: string;
  readonly progress: number;
  readonly state: Extract<LineRaceRunnerState, "RUNNING" | "TRAVERSING" | "FINISHED">;
  readonly accumulatedPenaltyMs: number;
  readonly finishedAt?: number;
}

interface PlayerProgressRecord {
  manualProgress: number;
  accumulatedPenaltyMs: number;
  progressFloor: number;
  traversal: { readonly startedAt: number; readonly endsAt: number; readonly frozenProgress: number } | null;
  finishedAt?: number;
}

export class LocalRaceProgressModel implements RaceProgressModel {
  private startAt = 0;
  private readonly records = new Map<string, PlayerProgressRecord>();

  constructor(
    private readonly playerIds: readonly string[],
    private readonly config: LineRaceRuntimeConfig,
  ) {
    if (playerIds.length !== 2 || new Set(playerIds).size !== 2) {
      throw new Error("LocalRaceProgressModel requires exactly two distinct players.");
    }
    this.reset();
  }

  start(startAt: number): void {
    assertEpoch(startAt, "startAt");
    this.reset();
    this.startAt = startAt;
  }

  getProgress(playerId: string, now: number): number {
    const record = this.record(playerId);
    assertEpoch(now, "now");
    if (record.finishedAt !== undefined) return this.config.raceLength;

    const traversalPenalty = this.traversalPenalty(record, now);
    const effectiveMs = Math.max(0, now - this.startAt - record.accumulatedPenaltyMs - traversalPenalty);
    const calculated = record.manualProgress + effectiveMs / 1000 * this.config.baseSpeedPerSecond;
    record.progressFloor = Math.min(this.config.raceLength, Math.max(record.progressFloor, calculated));

    if (record.traversal && now >= record.traversal.endsAt) {
      record.accumulatedPenaltyMs += record.traversal.endsAt - record.traversal.startedAt;
      record.traversal = null;
    }
    return record.progressFloor;
  }

  applyPenalty(playerId: string, penaltyMs: number): void {
    assertDuration(penaltyMs, "penaltyMs");
    this.record(playerId).accumulatedPenaltyMs += penaltyMs;
  }

  setTraversing(playerId: string, startedAt: number, durationMs: number): void {
    assertEpoch(startedAt, "startedAt");
    assertDuration(durationMs, "durationMs");
    const record = this.record(playerId);
    const frozenProgress = this.getProgress(playerId, startedAt);
    record.traversal = { startedAt, endsAt: startedAt + durationMs, frozenProgress };
  }

  finishPlayer(playerId: string, finishedAt: number): void {
    assertEpoch(finishedAt, "finishedAt");
    const record = this.record(playerId);
    record.progressFloor = this.config.raceLength;
    record.finishedAt = finishedAt;
    record.traversal = null;
  }

  addProgress(playerId: string, amount: number, now: number): void {
    if (!Number.isFinite(amount) || amount <= 0) throw new RangeError("amount must be a finite positive number.");
    const record = this.record(playerId);
    const current = this.getProgress(playerId, now);
    record.manualProgress += amount;
    record.progressFloor = Math.min(this.config.raceLength, current + amount);
  }

  getPlayerSnapshot(playerId: string, now: number): RaceProgressSnapshot {
    const record = this.record(playerId);
    const progress = this.getProgress(playerId, now);
    const traversing = record.traversal !== null && now < record.traversal.endsAt;
    return {
      playerId,
      progress,
      state: record.finishedAt !== undefined ? "FINISHED" : traversing ? "TRAVERSING" : "RUNNING",
      accumulatedPenaltyMs: record.accumulatedPenaltyMs + this.traversalPenalty(record, now),
      ...(record.finishedAt === undefined ? {} : { finishedAt: record.finishedAt }),
    };
  }

  reset(): void {
    this.startAt = 0;
    this.records.clear();
    for (const playerId of this.playerIds) {
      this.records.set(playerId, {
        manualProgress: 0,
        accumulatedPenaltyMs: 0,
        progressFloor: 0,
        traversal: null,
      });
    }
  }

  private traversalPenalty(record: PlayerProgressRecord, now: number): number {
    if (!record.traversal || now <= record.traversal.startedAt) return 0;
    return Math.min(now, record.traversal.endsAt) - record.traversal.startedAt;
  }

  private record(playerId: string): PlayerProgressRecord {
    const record = this.records.get(playerId);
    if (!record) throw new Error(`Unknown line-race player: ${playerId}`);
    return record;
  }
}

function assertEpoch(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite non-negative number.`);
}

function assertDuration(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a finite positive number.`);
}
