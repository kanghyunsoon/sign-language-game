import { describe, expect, it } from "vitest";

import {
  GAME_SYMBOL_REGISTRY,
  GAME_SYMBOLS,
  isCurrentModelSupported,
  isCurrentlyPlayable,
  metadataForSymbol,
  symbolsForCategory,
} from "./symbolRegistry";

describe("GAME_SYMBOL_REGISTRY", () => {
  it("contains the complete 41-symbol game contract with unique symbols", () => {
    expect(GAME_SYMBOL_REGISTRY).toHaveLength(41);
    expect(new Set(GAME_SYMBOLS).size).toBe(41);
    expect(symbolsForCategory("CONSONANT")).toHaveLength(14);
    expect(symbolsForCategory("VOWEL")).toHaveLength(17);
    expect(symbolsForCategory("DIGIT")).toHaveLength(10);
  });

  it("does not assume digit model support and keeps missing templates unavailable", () => {
    const zero = metadataForSymbol("0");
    expect(zero).toMatchObject({ modelSupported: false, templateAvailable: false, feedbackMode: "CLASSIFICATION_ONLY" });
    expect(isCurrentModelSupported("0", [])).toBe(false);
    expect(isCurrentlyPlayable(zero!, "AI", [])).toBe(false);
  });

  it("uses CAPABILITIES rather than registry order for current AI availability", () => {
    expect(isCurrentModelSupported("ㅏ", ["ㅏ", "ㄱ"])).toBe(true);
    expect(isCurrentModelSupported("ㄱ", ["ㅏ"])).toBe(false);
  });
});
