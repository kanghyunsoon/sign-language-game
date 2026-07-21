import type { JamoObstacleTemplate } from "./JamoObstacleTemplate";
import { JamoObstacleInstance, type LocalJamoObstacleSnapshot } from "./JamoObstacleInstance";
import { createCompetitiveJamoObstacleRegistry, type JamoObstacleRegistry } from "./JamoObstacleRegistry";
import { JAMO_OBSTACLE_BALANCE } from "./obstacleBalance";
import { ObstaclePlacementPolicy } from "./ObstaclePlacementPolicy";

export interface SpawnLocalObstacleOptions {
  readonly symbol: string;
  readonly targetPlayerId: string;
  readonly playerProgress: number;
  readonly raceLength: number;
  readonly now: number;
  readonly coursePosition?: number;
  readonly warningDurationMs?: number;
  readonly fallDurationMs?: number;
  readonly penaltyMs?: number;
}

export interface ObstaclePlayerProgress { readonly playerId: string; readonly progress: number; readonly state?: "RUNNING" | "TRAVERSING" | "FINISHED" }

export class JamoObstacleSystem {
  private readonly obstacles = new Map<string, JamoObstacleInstance>();
  private nextId = 1;
  constructor(
    readonly registry: JamoObstacleRegistry = createCompetitiveJamoObstacleRegistry(),
    private readonly placement = new ObstaclePlacementPolicy(),
  ) {}

  spawn(options: SpawnLocalObstacleOptions): LocalJamoObstacleSnapshot {
    const base = this.registry.requireSymbol(options.symbol);
    for (const [name, value] of [["warningDurationMs", options.warningDurationMs], ["fallDurationMs", options.fallDurationMs], ["penaltyMs", options.penaltyMs]] as const) {
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new RangeError(`${name} must be positive.`);
    }
    const template: JamoObstacleTemplate = {
      ...base,
      penaltyMs: options.penaltyMs ?? base.penaltyMs,
      fallDurationMs: options.fallDurationMs ?? base.fallDurationMs,
    };
    const existing = this.getSnapshots(options.now)
      .filter((item) => item.targetPlayerId === options.targetPlayerId && item.state !== "REMOVED")
      .map((item) => item.coursePosition);
    const coursePosition = this.placement.place({
      playerProgress: options.playerProgress,
      raceLength: options.raceLength,
      leadDistance: JAMO_OBSTACLE_BALANCE.obstacleLeadDistance,
      minimumSpacing: JAMO_OBSTACLE_BALANCE.minimumObstacleSpacing,
      existingCoursePositions: existing,
      ...(options.coursePosition === undefined ? {} : { requestedCoursePosition: options.coursePosition }),
    });
    const obstacle = new JamoObstacleInstance(
      `local-obstacle-${this.nextId++}`, template, options.targetPlayerId, coursePosition, options.now,
      options.warningDurationMs ?? JAMO_OBSTACLE_BALANCE.warningDurationMs,
      JAMO_OBSTACLE_BALANCE.removalDurationMs,
    );
    this.obstacles.set(obstacle.obstacleId, obstacle);
    return obstacle.snapshot(options.now);
  }

  update(
    now: number,
    players: readonly ObstaclePlayerProgress[],
    onTraversalStart: (playerId: string, obstacle: LocalJamoObstacleSnapshot) => void,
  ): void {
    for (const obstacle of this.obstacles.values()) obstacle.update(now);
    for (const player of players) {
      if (player.state === "TRAVERSING" || player.state === "FINISHED") continue;
      const hasTraversal = [...this.obstacles.values()].some((item) => item.targetPlayerId === player.playerId && item.state === "TRAVERSING");
      if (hasTraversal) continue;
      const next = [...this.obstacles.values()]
        .filter((item) => item.targetPlayerId === player.playerId && item.state === "ACTIVE" && player.progress >= item.coursePosition)
        .sort((a, b) => a.coursePosition - b.coursePosition)[0];
      if (!next) continue;
      next.startTraversal(now);
      onTraversalStart(player.playerId, next.snapshot(now));
    }
    for (const [id, obstacle] of this.obstacles) if (obstacle.state === "REMOVED") this.obstacles.delete(id);
  }

  counter(obstacleId: string, now: number): boolean {
    const obstacle = this.obstacles.get(obstacleId);
    if (!obstacle || !["WARNING", "FALLING", "ACTIVE"].includes(obstacle.state)) return false;
    obstacle.counter(now);
    return true;
  }

  counterNearest(playerId: string, symbol: string, playerProgress: number, now: number): string | null {
    const target = [...this.obstacles.values()]
      .filter((item) => item.targetPlayerId === playerId && item.template.symbol === symbol && ["WARNING", "FALLING", "ACTIVE"].includes(item.state) && item.coursePosition >= playerProgress)
      .sort((a, b) => a.coursePosition - b.coursePosition)[0];
    if (!target) return null;
    target.counter(now);
    return target.obstacleId;
  }

  forceTraversal(obstacleId: string, now: number): LocalJamoObstacleSnapshot | null {
    const obstacle = this.obstacles.get(obstacleId);
    if (!obstacle || obstacle.state !== "ACTIVE") return null;
    const hasTraversal = [...this.obstacles.values()].some((item) => item.targetPlayerId === obstacle.targetPlayerId && item.state === "TRAVERSING");
    if (hasTraversal) return null;
    obstacle.startTraversal(now);
    return obstacle.snapshot(now);
  }

  removeAll(now: number): void {
    for (const obstacle of this.obstacles.values()) {
      if (obstacle.state !== "TRAVERSING") obstacle.remove(now);
    }
  }

  getSnapshots(now: number): readonly LocalJamoObstacleSnapshot[] {
    return [...this.obstacles.values()].map((item) => item.snapshot(now)).sort((a, b) => a.coursePosition - b.coursePosition);
  }

  clear(): void { this.obstacles.clear(); this.nextId = 1; }
  dispose(): void { this.clear(); }
}
