import { describe, expect, it } from "vitest";
import { JamoObstacleRegistry, UnsupportedJamoSymbolError, createDefaultJamoObstacleRegistry } from "./JamoObstacleRegistry";
import { GIYEOK_TEMPLATE } from "./templates";

describe("JamoObstacleRegistry", () => {
  it("registers the 31 AI-supported unique templates", () => {
    const registry = createDefaultJamoObstacleRegistry();
    expect(registry.getAll()).toHaveLength(31);
    expect(new Set(registry.getSupportedSymbols())).toEqual(new Set(["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ", "ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ", "ㅐ", "ㅒ", "ㅔ", "ㅖ", "ㅢ", "ㅚ", "ㅟ"]));
  });

  it("rejects duplicate template IDs and duplicate symbols", () => {
    const registry = new JamoObstacleRegistry([GIYEOK_TEMPLATE]);
    expect(() => registry.register({ ...GIYEOK_TEMPLATE, symbol: "ㅋ" })).toThrow("templateId");
    expect(() => registry.register({ ...GIYEOK_TEMPLATE, templateId: "another-id" })).toThrow("symbol");
  });

  it("throws a clear unsupported symbol error", () => {
    expect(() => createDefaultJamoObstacleRegistry().requireSymbol("가")).toThrow(UnsupportedJamoSymbolError);
  });
});
