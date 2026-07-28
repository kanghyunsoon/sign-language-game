import { describe, expect, it } from "vitest";

import { GAME_SYMBOLS } from "../core/symbols";
import {
  hasSignGuide,
  SIGN_GUIDE_CROPS,
  SIGN_GUIDE_NUMBER_SYMBOLS,
} from "./SignGuideImage";

describe("SignGuideImage symbol contract", () => {
  it("has one approved guide for every playable jamo symbol", () => {
    const jamoSymbols = GAME_SYMBOLS.filter((symbol) => !/^\d+$/.test(symbol));
    expect(jamoSymbols).toHaveLength(31);
    expect(jamoSymbols.every((symbol) => hasSignGuide(symbol))).toBe(true);
    expect(SIGN_GUIDE_NUMBER_SYMBOLS).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  });

  it("keeps the sprite-sheet labels in their verified cells", () => {
    expect(SIGN_GUIDE_CROPS).toMatchObject({
      "ㄱ": { x: 31, y: 21 },
      "ㄴ": { x: 219, y: 21 },
      "ㅁ": { x: 31, y: 265 },
      "ㅏ": { x: 388, y: 21 },
      "ㅜ": { x: 576, y: 143 },
      "ㅢ": { x: 388, y: 509 },
    });
  });

  it("does not silently substitute a different symbol's image", () => {
    expect(hasSignGuide("0")).toBe(false);
    expect(hasSignGuide("없는기호")).toBe(false);
  });
});
