import type { LineRaceClock } from "./LineRaceClock";
import {
  LocalLineRaceRuntime,
  type LineRaceDevPlayerId,
  type LineRaceRuntimeSnapshot,
  type SpawnRuntimeObstacleOptions,
} from "./LineRaceRuntime";
import type { JamoObstacleTemplate, LocalJamoObstacleSnapshot } from "../obstacle";

export class LineRaceController {
  constructor(
    readonly runtime: LocalLineRaceRuntime,
    private readonly clock: LineRaceClock,
  ) {}

  start(): void {
    this.runtime.start(this.clock.now() + this.runtime.config.countdownMs);
  }

  pause(): void { this.runtime.pause(); }
  resume(): void { this.runtime.resume(); }
  reset(): void { this.runtime.reset(); }
  finishByTime(): void { this.runtime.finish(); }
  addProgress(playerId: LineRaceDevPlayerId, amount = 100): void { this.runtime.addProgress(playerId, amount); }
  applyPenalty(playerId: LineRaceDevPlayerId, penaltyMs: number): void { this.runtime.applyPenalty(playerId, penaltyMs); }
  startTraversing(playerId: LineRaceDevPlayerId, durationMs = 1_500): void { this.runtime.setTraversing(playerId, durationMs); }
  forceWinner(playerId: LineRaceDevPlayerId): void { this.runtime.forceWinner(playerId); }
  spawnObstacle(options: SpawnRuntimeObstacleOptions): LocalJamoObstacleSnapshot { return this.runtime.spawnObstacle(options); }
  counterObstacle(obstacleId: string): boolean { return this.runtime.counterObstacle(obstacleId); }
  counterNearestObstacle(playerId: LineRaceDevPlayerId, symbol: string): string | null { return this.runtime.counterNearestObstacle(playerId, symbol); }
  forceObstacleTraversal(obstacleId: string): boolean { return this.runtime.forceObstacleTraversal(obstacleId); }
  removeAllObstacles(): void { this.runtime.removeAllObstacles(); }
  getObstacleTemplates(): readonly JamoObstacleTemplate[] { return this.runtime.getObstacleTemplates(); }
  getSnapshot(): LineRaceRuntimeSnapshot { return this.runtime.getSnapshot(); }
  now(): number { return this.clock.now(); }
}
