import { defineJamoObstacleTemplate } from "../JamoObstacleTemplate";
export const NIEUN_TEMPLATE = defineJamoObstacleTemplate({ templateId: "jamo-nieun-v1", symbol: "ㄴ", tier: 1, normalizedPath: [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], visualBounds: { width: .13, height: .25 }, entryOffset: { x: 0, y: 0 }, exitOffset: { x: 1, y: 1 }, penaltyMs: 1600, fallDurationMs: 500 });
