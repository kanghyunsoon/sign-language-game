import { describe, expect, it } from "vitest";
import { symbolRangeLabel } from "./BattleRoomCard";

describe("BattleRoomCard symbol range", () => {
  it.each([["CONSONANT", "자음"], ["VOWEL", "모음"], ["ALL", "기초 혼합"]] as const)("labels %s rooms correctly", (range, expected) => {
    expect(symbolRangeLabel(range)).toBe(expected);
  });
});
