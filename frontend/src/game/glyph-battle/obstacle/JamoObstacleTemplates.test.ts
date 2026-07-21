import { describe, expect, it } from "vitest";
import { createDefaultJamoObstacleRegistry } from "./JamoObstacleRegistry";

describe("jamo obstacle paths", () => {
  const registry = createDefaultJamoObstacleRegistry();

  it("keeps every normalized path inside 0..1", () => {
    for (const template of registry.getAll()) {
      expect(template.normalizedPath.length).toBeGreaterThanOrEqual(2);
      for (const point of template.normalizedPath) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(1);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(1);
      }
      expect(template.penaltyMs).toBeGreaterThan(0);
      expect(template.normalizedPath[0]).toEqual(template.entryOffset);
      expect(template.normalizedPath.at(-1)).toEqual(template.exitOffset);
    }
  });

  it("uses recognizable corner routes for ㄱ and ㄴ", () => {
    expect(registry.requireSymbol("ㄱ").normalizedPath).toEqual([
      { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 },
    ]);
    expect(registry.requireSymbol("ㄴ").normalizedPath).toEqual([
      { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 },
    ]);
  });

  it("closes the ㅁ and ㅇ outlines", () => {
    for (const symbol of ["ㅁ", "ㅇ"]) {
      const path = registry.requireSymbol(symbol).normalizedPath;
      expect(path[0]).toEqual(path.at(-1));
    }
  });

  it("keeps ㅡ horizontal and ㅣ vertical", () => {
    const eu = registry.requireSymbol("ㅡ").normalizedPath;
    expect(new Set(eu.map((point) => point.y)).size).toBe(1);
    expect(eu[0]?.x).toBe(0);
    expect(eu.at(-1)?.x).toBe(1);

    const i = registry.requireSymbol("ㅣ").normalizedPath;
    expect(new Set(i.map((point) => point.x)).size).toBe(1);
    expect(Math.min(...i.map((point) => point.y))).toBe(0);
    expect(Math.max(...i.map((point) => point.y))).toBe(1);
  });
});
