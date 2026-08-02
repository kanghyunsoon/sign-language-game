import { describe, expect, it } from "vitest";

import { symbolRangeLabel } from "./BattleRoomCard";

describe("BattleRoomCard symbol range", () => {
  it.each([
    ["CONSONANTS", ["ㄱ", "ㄴ"], "자음"],
    ["VOWELS", ["ㅏ", "ㅓ"], "모음"],
    ["BASIC", ["ㄱ", "ㅏ"], "기초 혼합"],
    ["BASIC", ["ㅏ", "ㅓ"], "모음"],
    ["기본", [], "기초 혼합"],
  ] as const)("labels %s rooms correctly", (difficulty, symbolRange, expected) => {
    expect(symbolRangeLabel({ difficulty, symbolRange })).toBe(expected);
  });
});
