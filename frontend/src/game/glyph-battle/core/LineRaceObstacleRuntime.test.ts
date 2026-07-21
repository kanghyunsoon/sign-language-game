import { describe, expect, it } from "vitest";
import { createDevLineRaceScenario } from "../dev/createDevLineRaceScenario";

function setup() {
  let now = 0;
  const scenario = createDevLineRaceScenario({}, () => now);
  return { ...scenario, setNow(value: number) { now = value; } };
}

describe("line-race obstacle runtime integration", () => {
  it("automatically traverses an active obstacle for exactly template penalty", () => {
    const value = setup(); value.controller.start(); value.setNow(3_000); value.runtime.update(3_000);
    const obstacle = value.controller.spawnObstacle({ symbol: "ㄱ", targetPlayerId: "PLAYER_A", warningDurationMs: 100, fallDurationMs: 100, penaltyMs: 500 });
    value.setNow(3_200); value.runtime.update(3_200);
    expect(value.runtime.getSnapshot().obstacles[0]?.state).toBe("ACTIVE");
    value.setNow(9_700); value.runtime.update(9_700);
    expect(value.runtime.getSnapshot().obstacles.find((item) => item.obstacleId === obstacle.obstacleId)?.state).toBe("TRAVERSING");
    expect(value.runtime.getSnapshot().players[0]?.state).toBe("TRAVERSING");
    value.setNow(10_200); value.runtime.update(10_200);
    expect(value.runtime.getSnapshot().players[0]).toMatchObject({ state: "RUNNING", accumulatedPenaltyMs: 500 });
  });

  it("prioritizes a nearest symbol counter and prevents traversal", () => {
    const value = setup(); value.controller.start(); value.setNow(3_000); value.runtime.update(3_000);
    const obstacle = value.controller.spawnObstacle({ symbol: "ㄴ", targetPlayerId: "PLAYER_B", warningDurationMs: 100, fallDurationMs: 100 });
    value.setNow(3_200); value.runtime.update(3_200);
    expect(value.controller.counterNearestObstacle("PLAYER_B", "ㄴ")).toBe(obstacle.obstacleId);
    value.setNow(6_000); value.runtime.update(6_000);
    expect(value.runtime.getSnapshot().players[1]?.state).toBe("RUNNING");
    expect(value.runtime.getSnapshot().obstacles).toEqual([]);
  });

  it("keeps sorted obstacle instances and clears them on reset/dispose", () => {
    const value = setup(); value.controller.start(); value.setNow(3_000); value.runtime.update(3_000);
    for (const symbol of ["ㄱ", "ㄴ", "ㅁ"]) value.controller.spawnObstacle({ symbol, targetPlayerId: "PLAYER_A" });
    expect(value.runtime.getSnapshot().obstacles.map((item) => item.coursePosition)).toEqual([160, 220, 280]);
    value.controller.reset();
    expect(value.runtime.getSnapshot().obstacles).toEqual([]);
    value.runtime.dispose();
    expect(value.runtime.getSnapshot().obstacles).toEqual([]);
  });
});
