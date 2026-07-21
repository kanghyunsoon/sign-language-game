import { describe, expect, it } from "vitest";

import { GAME_SYMBOLS } from "../../recognition/core/symbols";
import { GLYPH_DISPLAY_FONT_RATIO, getGlyphRasterMetrics, mergeOccupiedGlyphCells } from "./glyphRaster";

describe("glyphRaster", () => {
  it("provides finite normalized metrics for every game symbol", () => {
    expect(GAME_SYMBOLS).toHaveLength(41);
    for (const symbol of GAME_SYMBOLS) {
      const metrics = getGlyphRasterMetrics(symbol);
      expect(metrics.widthRatio, symbol).toBeGreaterThan(0);
      expect(metrics.widthRatio, symbol).toBeLessThanOrEqual(1);
      expect(metrics.heightRatio, symbol).toBeGreaterThan(0);
      expect(metrics.heightRatio, symbol).toBeLessThanOrEqual(1);
    }
  });

  it("uses one font-size ratio for consonants, vowels, and digits", () => {
    expect(GLYPH_DISPLAY_FONT_RATIO).toBe(1);
  });

  it("separates an L-shaped glyph mask into its visible strokes", () => {
    expect(mergeOccupiedGlyphCells([
      [true, true, true],
      [true, false, false],
      [true, false, false],
    ])).toEqual([
      { x: 0, y: 0, width: 3, height: 1 },
      { x: 0, y: 1, width: 1, height: 2 },
    ]);
  });
});
