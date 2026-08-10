import { describe, expect, it } from "vitest";
import { createDefaultJamoObstacleRegistry } from "../obstacle";
import { createRoadTemplate } from "./JamoObstacleRenderer";

describe("jamo road conversion", () => {
  const registry = createDefaultJamoObstacleRegistry();

  it("gives every jamo world a left entry and right exit on the race road", () => {
    for (const template of registry.getAll()) {
      const road = createRoadTemplate(template);
      expect(road.normalizedPath[0]).toEqual({ x: 0, y: 1 });
      expect(road.normalizedPath.at(-1)).toEqual({ x: 1, y: 1 });
      expect(road.entryOffset).toEqual({ x: 0, y: 1 });
      expect(road.exitOffset).toEqual({ x: 1, y: 1 });
    }
  });

  it("traces ㄱ and walks back over its own strokes without diagonal connectors", () => {
    const template = registry.requireSymbol("ㄱ");
    const road = createRoadTemplate(template);
    const firstPass = template.normalizedPath.map((point) => ({
      x: .16 + point.x * .68,
      y: 1 - (template.normalizedPath[0]!.y - point.y) * .8,
    }));
    expect(road.normalizedPath.slice(1, firstPass.length + 1)).toEqual(firstPass);
    expect(road.normalizedPath.slice(firstPass.length + 1, -1)).toEqual(firstPass.slice(0, -1).reverse());
  });
});
