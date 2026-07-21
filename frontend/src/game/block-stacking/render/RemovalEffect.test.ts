import { describe, expect, it } from "vitest";

import { RemovalEffect } from "./RemovalEffect";

describe("RemovalEffect", () => {
  it("reports progress until its 150ms default renderer duration completes", () => {
    const effect = new RemovalEffect("letter-1", 150);

    expect(effect.progress).toBe(0);
    expect(effect.isFinished).toBe(false);
    expect(effect.advance(75)).toBe(0.5);
    expect(effect.isFinished).toBe(false);
    expect(effect.advance(75)).toBe(1);
    expect(effect.isFinished).toBe(true);
  });

  it("rejects effects outside the required 100-350ms highlight window", () => {
    expect(() => new RemovalEffect("letter-1", 99)).toThrow(RangeError);
    expect(() => new RemovalEffect("letter-1", 351)).toThrow(RangeError);
  });

  it("rejects invalid elapsed time", () => {
    const effect = new RemovalEffect("letter-1", 150);

    expect(() => effect.advance(-1)).toThrow(RangeError);
    expect(() => effect.advance(Number.NaN)).toThrow(RangeError);
  });
});
