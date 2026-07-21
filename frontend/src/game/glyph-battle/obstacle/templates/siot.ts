import { defineJamoObstacleTemplate } from "../JamoObstacleTemplate";
export const SIOT_TEMPLATE = defineJamoObstacleTemplate({ templateId: "jamo-siot-v1", symbol: "ㅅ", tier: 1, normalizedPath: [{ x: 0, y: 1 }, { x: .5, y: 0 }, { x: 1, y: 1 }], visualBounds: { width: .14, height: .27 }, entryOffset: { x: 0, y: 1 }, exitOffset: { x: 1, y: 1 }, penaltyMs: 1800, fallDurationMs: 520 });
