import { describe, expect, it } from "vitest";
import { ObstaclePlacementPolicy } from "./ObstaclePlacementPolicy";

describe("ObstaclePlacementPolicy", () => {
  const policy = new ObstaclePlacementPolicy();
  it("places multiple obstacles in course order with minimum spacing", () => {
    const first = policy.place({ playerProgress: 100, raceLength: 1000, leadDistance: 100, minimumSpacing: 80, existingCoursePositions: [] });
    const second = policy.place({ playerProgress: 100, raceLength: 1000, leadDistance: 100, minimumSpacing: 80, existingCoursePositions: [first] });
    const third = policy.place({ playerProgress: 100, raceLength: 1000, leadDistance: 100, minimumSpacing: 80, existingCoursePositions: [second, first] });
    expect([first, second, third]).toEqual([200, 280, 360]);
  });
  it("rejects already passed and out-of-course positions", () => {
    expect(() => policy.place({ playerProgress: 300, raceLength: 1000, leadDistance: 100, minimumSpacing: 80, existingCoursePositions: [], requestedCoursePosition: 250 })).toThrow("already passed");
    expect(() => policy.place({ playerProgress: 950, raceLength: 1000, leadDistance: 100, minimumSpacing: 80, existingCoursePositions: [] })).toThrow("finish line");
  });
});
