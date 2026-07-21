import { describe, expect, it } from "vitest";

import { ScoreTracker } from "./ScoreTracker";

describe("ScoreTracker", () => {
  it("awards base score scaled by the growing combo and tracks best combo", () => {
    const tracker = new ScoreTracker();
    expect(tracker.recordRemoval()).toMatchObject({ score: 100, combo: 1, bestCombo: 1, removedCount: 1 });
    expect(tracker.recordRemoval()).toMatchObject({ score: 300, combo: 2, bestCombo: 2, removedCount: 2 });
  });

  it("resets combo on an incorrect input by default without changing score", () => {
    const tracker = new ScoreTracker();
    tracker.recordRemoval();
    expect(tracker.recordIncorrect()).toMatchObject({ score: 100, combo: 0, bestCombo: 1 });
  });

  it("keeps score unchanged for a no-target input with the default policy", () => {
    const tracker = new ScoreTracker();
    tracker.recordRemoval();
    expect(tracker.recordNoTarget().score).toBe(100);
  });
});
