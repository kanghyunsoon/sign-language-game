import { describe, expect, it } from "vitest";

import { GAME_SYMBOLS } from "../../recognition/core/symbols";
import {
  GAME_GLYPH_FILL_COLOR,
  GAME_GLYPH_STROKE_COLOR,
  GAME_GLYPH_STROKE_WIDTH,
  GLYPH_COLLISION_TUNING,
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

  it("uses the committed default collider for the single vertical vowel", () => {
    // dc1acd3\uc774 \ud45c\uc2dc \ud3f0\ud2b8\ub97c Jua\ub85c \ubc14\uafb8\uba74\uc11c \uc587\uc544\uc9c4 \uc138\ub85c\ud68d\uc744 1.45\ubc30\ub85c \ub113\ud614\uc9c0\ub9cc(34 -> 49.3),
    // f1a6525\uac00 \ud3f0\ud2b8\ub97c Noto Sans KR\ub85c \ub418\ub3cc\ub9ac\uba70 \uadf8 \ubcf4\uc815\ub3c4 \ud568\uaed8 \uc81c\uac70\ud588\ub2e4. \uce21\uc815 \ud3f0\ud2b8\uc640
    // \ud45c\uc2dc \ud3f0\ud2b8\uac00 \ub2e4\uc2dc \uac19\uc740 face\uc774\ubbc0\ub85c \ubcf4\uc815 \uc5c6\uc774 glyphCollisionDefaults.json \uac12\uc744 \uc4f4\ub2e4.
    expect(GLYPH_COLLISION_TUNING["\u3163"]).toBeUndefined();
    const [vertical] = getGlyphCollisionRects("\u3163");
    expect(vertical?.width).toBeCloseTo(34, 1);
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
