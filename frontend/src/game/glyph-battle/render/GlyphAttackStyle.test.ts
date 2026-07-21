import { describe, expect, it } from "vitest";
import { getGlyphAttackStyle } from "./JamoObstacleRenderer";

describe("glyph attack styles", () => {
  it("derives a distinct attack behavior from the written shape", () => {
    expect(getGlyphAttackStyle("ㅇ").kind).toBe("SEAL");
    expect(getGlyphAttackStyle("ㅣ").kind).toBe("WAVE");
    expect(getGlyphAttackStyle("ㄱ").kind).toBe("CUT");
    expect(getGlyphAttackStyle("ㅊ").kind).toBe("BURST");
  });
});
