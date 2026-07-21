import { describe, expect, it } from "vitest";

import { SettlementDetector } from "./SettlementDetector";
import { DEFAULT_PHYSICS_CONFIG } from "./types";

describe("SettlementDetector", () => {
  it("requires continuous low linear and angular velocity before settling", () => {
    const detector = new SettlementDetector({
      ...DEFAULT_PHYSICS_CONFIG,
      settleDurationMs: 100,
      linearVelocityThreshold: 0.1,
      angularVelocityThreshold: 0.1,
    });
    const still = [{ id: "a", linearSpeed: 0.05, angularSpeed: 0.05 }];
    expect(detector.update(still, 60).newlySettledIds).toEqual([]);
    expect(detector.update(still, 40).newlySettledIds).toEqual(["a"]);
    expect(detector.isSettled("a")).toBe(true);
  });

  it("resets the settle timer when the body moves again", () => {
    const detector = new SettlementDetector({
      ...DEFAULT_PHYSICS_CONFIG,
      settleDurationMs: 100,
      linearVelocityThreshold: 0.1,
      angularVelocityThreshold: 0.1,
    });
    const still = [{ id: "a", linearSpeed: 0.05, angularSpeed: 0.05 }];
    detector.update(still, 90);
    expect(detector.update([{ id: "a", linearSpeed: 0.2, angularSpeed: 0 }], 10).movedIds).toEqual([]);
    expect(detector.update(still, 99).newlySettledIds).toEqual([]);
    expect(detector.update(still, 1).newlySettledIds).toEqual(["a"]);
  });
});
