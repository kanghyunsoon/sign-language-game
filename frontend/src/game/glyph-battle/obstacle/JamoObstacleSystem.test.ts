import { describe, expect, it, vi } from "vitest";
import { JamoObstacleSystem } from "./JamoObstacleSystem";

describe("JamoObstacleSystem", () => {
  it("sorts three sequential obstacles and starts only the nearest eligible one", () => {
    const system = new JamoObstacleSystem();
    for (const symbol of ["ㄱ", "ㄴ", "ㅁ"]) system.spawn({ symbol, targetPlayerId: "PLAYER_A", playerProgress: 0, raceLength: 1000, now: 0, warningDurationMs: 10, fallDurationMs: 10, penaltyMs: 100 });
    expect(system.getSnapshots(0).map((item) => item.coursePosition)).toEqual([160, 220, 280]);
    const traversal = vi.fn();
    system.update(20, [{ playerId: "PLAYER_A", progress: 400 }], traversal);
    expect(traversal).toHaveBeenCalledTimes(1);
    expect(system.getSnapshots(20).map((item) => item.state)).toEqual(["TRAVERSING", "ACTIVE", "ACTIVE"]);
  });

  it("does not traverse a countered obstacle", () => {
    const system = new JamoObstacleSystem();
    const spawned = system.spawn({ symbol: "ㄱ", targetPlayerId: "PLAYER_A", playerProgress: 0, raceLength: 1000, now: 0, warningDurationMs: 10, fallDurationMs: 10 });
    const traversal = vi.fn();
    system.update(20, [{ playerId: "PLAYER_A", progress: 0 }], traversal);
    expect(system.counter(spawned.obstacleId, 25)).toBe(true);
    system.update(1_000, [{ playerId: "PLAYER_A", progress: 500 }], traversal);
    expect(traversal).not.toHaveBeenCalled();
    expect(system.getSnapshots(1_000)).toHaveLength(0);
  });

  it("clears all instance references on dispose", () => {
    const system = new JamoObstacleSystem();
    system.spawn({ symbol: "ㄱ", targetPlayerId: "PLAYER_A", playerProgress: 0, raceLength: 1000, now: 0 });
    system.dispose();
    expect(system.getSnapshots(0)).toEqual([]);
  });
});
