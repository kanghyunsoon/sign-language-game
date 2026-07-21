import { describe, expect, it } from "vitest";
import { COMPETITIVE_RECOGNITION_SYMBOLS, RECOGNITION_CLASS_READINESS, readinessForSymbol } from "./recognitionReadiness";
import { LINE_RACE_SYMBOLS } from "../../glyph-battle/components/LineRaceCreateRoomForm";

describe("recognition readiness", () => {
  it("covers every model output exactly once and quarantines known impossible symbols", () => {
    expect(RECOGNITION_CLASS_READINESS).toHaveLength(31);
    expect(new Set(RECOGNITION_CLASS_READINESS.map((item) => item.symbol)).size).toBe(31);
    expect(readinessForSymbol("ㅠ")).toMatchObject({ competitiveEligible: false, confirmationRate: 0 });
    expect(readinessForSymbol("ㅅ")).toMatchObject({ competitiveEligible: false });
    expect(COMPETITIVE_RECOGNITION_SYMBOLS).not.toContain("ㅠ");
    expect(COMPETITIVE_RECOGNITION_SYMBOLS).not.toContain("ㅅ");
  });

  it("is the exact frontend line-race competitive symbol source", () => {
    expect(LINE_RACE_SYMBOLS).toEqual(COMPETITIVE_RECOGNITION_SYMBOLS);
  });
});
