import { describe, expect, it } from "vitest";

import { towerHeightRatio } from "./towerHeight";

describe("towerHeightRatio", () => {
  it("reports an empty board as zero", () => {
    expect(towerHeightRatio([], 960, 160, 140)).toBe(0);
  });

  it("uses the topmost glyph and caps the danger line at one", () => {
    const states = [
      { id: "low", symbol: "ㄱ", x: 100, y: 820, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: true },
      { id: "top", symbol: "ㄴ", x: 100, y: 560, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: true },
    ];

    expect(towerHeightRatio(states, 960, 160, 140)).toBeCloseTo(.5875);
    expect(towerHeightRatio([{ ...states[1], y: 150 }], 960, 160, 140)).toBe(1);
  });
});
