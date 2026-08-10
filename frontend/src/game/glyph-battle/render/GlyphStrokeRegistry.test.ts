import { describe, expect, it } from "vitest";
import { GAME_SYMBOL_REGISTRY } from "../../block-stacking/metadata/symbolRegistry";
import { GLYPH_STROKES, glyphSegments } from "./GlyphStrokeRegistry";
import { getGlyphCombatRule } from "../duel/GlyphCombatRules";

describe("GlyphStrokeRegistry", () => {
  it("defines every playable Korean jamo instead of falling back to an X", () => {
    const jamo=GAME_SYMBOL_REGISTRY.filter((entry)=>entry.category!=="DIGIT").map((entry)=>entry.symbol);
    expect(Object.keys(GLYPH_STROKES).sort()).toEqual([...jamo].sort());
    for(const symbol of jamo) expect(glyphSegments(symbol).length).toBeGreaterThan(0);
  });

  it("keeps bieup open and complex vowels distinct", () => {
    const bieup=glyphSegments("ㅂ");
    expect(bieup).toHaveLength(4);
    expect(bieup[1][0]).toBeLessThan(bieup[0][0]);
    expect(bieup[1][2]).toBeGreaterThan(bieup[3][0]);
    expect(glyphSegments("ㅒ")).toHaveLength(4);
    expect(glyphSegments("ㅔ")).toHaveLength(3);
    expect(glyphSegments("ㅖ")).toHaveLength(4);
    expect(glyphSegments("ㅢ")).toHaveLength(2);
    expect(getGlyphCombatRule("ㅔ").role).toBe("FOCUS");
    expect(getGlyphCombatRule("ㅖ").role).toBe("FOCUS");
  });

  it("locks the visible stroke topology for every playable jamo", () => {
    const expectedCounts: Readonly<Record<string, number>> = {
      ㄱ:2, ㄴ:2, ㄷ:3, ㄹ:5, ㅁ:4, ㅂ:4, ㅅ:2, ㅇ:8,
      ㅈ:3, ㅊ:3, ㅋ:3, ㅌ:4, ㅍ:4, ㅎ:9,
      ㅏ:2, ㅑ:3, ㅓ:2, ㅕ:3, ㅗ:2, ㅛ:3, ㅜ:2, ㅠ:3,
      ㅡ:1, ㅣ:1, ㅐ:3, ㅒ:4, ㅔ:3, ㅖ:4, ㅢ:2, ㅚ:3, ㅟ:3,
    };
    expect(Object.keys(GLYPH_STROKES).sort()).toEqual(Object.keys(expectedCounts).sort());
    for (const [symbol, expected] of Object.entries(expectedCounts)) {
      const strokes=glyphSegments(symbol);
      expect(strokes, symbol).toHaveLength(expected);
      for (const [x1,y1,x2,y2] of strokes) {
        expect([x1,y1,x2,y2].every((value)=>value>=-.75&&value<=.75), symbol).toBe(true);
        expect(x1===x2&&y1===y2, symbol).toBe(false);
      }
    }
  });

  it("preserves the distinguishing axes of easily confused jamo", () => {
    const horizontal=([x1,y1,x2,y2]: readonly number[])=>y1===y2&&x1!==x2;
    const vertical=([x1,y1,x2,y2]: readonly number[])=>x1===x2&&y1!==y2;
    expect(glyphSegments("ㅂ").filter(horizontal)).toHaveLength(2);
    expect(glyphSegments("ㅂ").filter(vertical)).toHaveLength(2);
    expect(glyphSegments("ㅌ").filter(horizontal)).toHaveLength(3);
    expect(glyphSegments("ㅌ").filter(vertical)).toHaveLength(1);
    expect(glyphSegments("ㅢ").filter(horizontal)).toHaveLength(1);
    expect(glyphSegments("ㅢ").filter(vertical)).toHaveLength(1);
    expect(glyphSegments("ㅒ").filter(horizontal)).toHaveLength(2);
    expect(glyphSegments("ㅒ").filter(vertical)).toHaveLength(2);
  });
});
