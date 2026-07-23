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
  it("contains the complete 40-symbol game contract with unique symbols", () => {
    expect(GAME_SYMBOL_REGISTRY).toHaveLength(40);
    expect(new Set(GAME_SYMBOLS).size).toBe(40);
    expect(symbolsForCategory("CONSONANT")).toHaveLength(14);
    expect(symbolsForCategory("VOWEL")).toHaveLength(17);
    expect(symbolsForCategory("DIGIT")).toHaveLength(9);
  });

  it("does not assume digit model support and keeps missing templates unavailable", () => {
    const one = metadataForSymbol("1");
    expect(one).toMatchObject({ modelSupported: false, templateAvailable: false, feedbackMode: "CLASSIFICATION_ONLY" });
    expect(metadataForSymbol("0")).toBeUndefined();
    expect(isCurrentModelSupported("1", [])).toBe(false);
    expect(isCurrentlyPlayable(one!, "AI", [])).toBe(false);
  });

  it("uses CAPABILITIES rather than registry order for current AI availability", () => {
    expect(isCurrentModelSupported("ㅏ", ["ㅏ", "ㄱ"])).toBe(true);
    expect(isCurrentModelSupported("ㄱ", ["ㅏ"])).toBe(false);
  });
});
