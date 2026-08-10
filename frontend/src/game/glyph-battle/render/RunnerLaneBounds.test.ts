import { describe, expect, it } from "vitest";
import { clampRunnerToLane } from "./RunnerLaneBounds";

describe("clampRunnerToLane", () => {
  it("keeps traversal inside its own lane and track", () => {
    expect(clampRunnerToLane({ x: 999, y: 500, rotation: 2 }, 150, 100, 600)).toEqual({ x: 564, y: 172, rotation: .12 });
    expect(clampRunnerToLane({ x: -50, y: -200, rotation: -2 }, 330, 100, 600)).toEqual({ x: 136, y: 308, rotation: -.12 });
  });
});
