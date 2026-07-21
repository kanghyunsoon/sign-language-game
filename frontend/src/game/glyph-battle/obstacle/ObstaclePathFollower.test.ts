import { describe, expect, it } from "vitest";
import { TimeBasedObstaclePathFollower } from "./ObstaclePathFollower";
import { ObstaclePathSampler } from "./ObstaclePathSampler";
import { NIEUN_TEMPLATE } from "./templates";

describe("obstacle path sampling and following", () => {
  it("samples by path length rather than point index", () => {
    const sampled = new ObstaclePathSampler().sample([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], .5);
    expect(sampled).toMatchObject({ x: 1, y: 0 });
  });

  it("uses template penalty duration and preserves traversal ratio on resize", () => {
    const follower = new TimeBasedObstaclePathFollower();
    follower.start({ template: NIEUN_TEMPLATE, startedAt: 0, durationMs: NIEUN_TEMPLATE.penaltyMs, obstacleBounds: { x: 100, y: 50, width: 100, height: 200 } });
    const halfway = follower.getPosition(NIEUN_TEMPLATE.penaltyMs / 2);
    follower.resize({ x: 200, y: 100, width: 200, height: 400 });
    const resized = follower.getPosition(NIEUN_TEMPLATE.penaltyMs / 2);
    expect(resized.x - 200).toBeCloseTo((halfway.x - 100) * 2);
    expect(resized.y - 100).toBeCloseTo((halfway.y - 50) * 2);
    expect(resized.completed).toBe(false);
    expect(follower.getPosition(NIEUN_TEMPLATE.penaltyMs).completed).toBe(true);
  });
});
