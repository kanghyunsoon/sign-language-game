import { describe, expect, it } from "vitest";

import { GLYPH_STROKE_TEMPLATES, glyphStrokeTemplatesFor } from "./glyphStrokeTemplates";

describe("glyph stroke templates", () => {
  it("keeps each Korean character collider to a few long rectangles", () => {
    const templates = Object.values(GLYPH_STROKE_TEMPLATES);

    expect(templates).toHaveLength(31);
    expect(templates.every((strokes) => strokes.length >= 1 && strokes.length <= 7)).toBe(true);
  });

  it("returns the intended two-stroke geometry for giyeok and siot", () => {
    expect(glyphStrokeTemplatesFor("\u3131")).toHaveLength(2);
    expect(glyphStrokeTemplatesFor("\u3145")).toHaveLength(2);
    expect(glyphStrokeTemplatesFor("1")).toBeUndefined();
  });

  it("keeps closed glyph interiors open", () => {
    expect(glyphStrokeTemplatesFor("\u3141")).toHaveLength(4);
    expect(glyphStrokeTemplatesFor("\u3142")).toHaveLength(5);
    expect(glyphStrokeTemplatesFor("\u3147")).toHaveLength(4);
    expect(glyphStrokeTemplatesFor("\u314E")).toHaveLength(6);
  });
});
