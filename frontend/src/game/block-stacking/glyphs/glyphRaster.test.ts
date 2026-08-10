import { describe, expect, it } from "vitest";

import { GAME_SYMBOLS } from "../../recognition/core/symbols";
import {
  GAME_GLYPH_FILL_COLOR,
  GAME_GLYPH_STROKE_COLOR,
  GAME_GLYPH_STROKE_WIDTH,
  GLYPH_DISPLAY_FONT_RATIO,
  getGlyphCollisionRects,
  getGlyphRasterMetrics,
  mergeOccupiedGlyphCells,
} from "./glyphRaster";

describe("glyphRaster", () => {
  it("provides finite normalized metrics for every game symbol", () => {
    expect(GAME_SYMBOLS).toHaveLength(40);
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

  it("renders a strong contrasting outline without changing collider metrics", () => {
    expect(GAME_GLYPH_STROKE_COLOR).not.toBe(GAME_GLYPH_FILL_COLOR);
    expect(GAME_GLYPH_STROKE_WIDTH).toBeGreaterThanOrEqual(6);
  });

  it("widens the single vertical vowel collider to match its artwork", () => {
    const [vertical] = getGlyphCollisionRects("\u3163");
    expect(vertical?.width).toBeCloseTo(49.3, 1);
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
