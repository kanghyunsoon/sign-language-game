import { LINE_RACE_RUNTIME_TRANSFORMS } from "../core/LineRaceBalance";

export interface NormalizedObstaclePoint {
  readonly x: number;
  readonly y: number;
}

export interface JamoObstacleTemplate {
  readonly templateId: string;
  readonly symbol: string;
  readonly tier: 1 | 2 | 3;
  readonly normalizedPath: readonly NormalizedObstaclePoint[];
  /** Fractions of the lane width and available traversal height. */
  readonly visualBounds: { readonly width: number; readonly height: number };
  readonly entryOffset: NormalizedObstaclePoint;
  readonly exitOffset: NormalizedObstaclePoint;
  readonly penaltyMs: number;
  readonly fallDurationMs: number;
}

/** Gives the runner enough time to read and visibly walk the complete jamo route. */
export const JAMO_TRAVERSAL_DURATION_SCALE = LINE_RACE_RUNTIME_TRANSFORMS.traversalDurationScale;

const route = (...coordinates: readonly number[]): readonly NormalizedObstaclePoint[] => {
  const points: NormalizedObstaclePoint[] = [];
  for (let index = 0; index < coordinates.length; index += 2) {
    points.push({ x: coordinates[index]!, y: coordinates[index + 1]! });
  }
  return points;
};

/** Continuous walking routes shaped like each supported Korean jamo. */
const CANONICAL_JAMO_ROUTES: Readonly<Record<string, readonly NormalizedObstaclePoint[]>> = {
  "ㄱ": route(1,1, 1,0, 0,0),
  "ㄴ": route(1,1, 0,1, 0,0),
  "ㄷ": route(1,1, 0,1, 0,0, 1,0),
  "ㄹ": route(0,1, 1,1, 1,.68, .2,.68, .2,.34, 1,.34, 1,0, 0,0),
  "ㅁ": route(0,1, 1,1, 1,0, 0,0, 0,1),
  "ㅂ": route(0,1, 1,1, 1,0, 0,0, 0,1, 0,.5, 1,.5),
  "ㅅ": route(0,1, .5,0, 1,1),
  "ㅇ": route(.5,1, .18,.88, 0,.5, .18,.12, .5,0, .82,.12, 1,.5, .82,.88, .5,1),
  "ㅈ": route(0,1, .5,.32, 1,1, .5,.32, 0,0, 1,0),
  "ㅊ": route(0,1, .5,.38, 1,1, .5,.38, 0,.22, 1,.22, .5,.22, .5,0),
  "ㅋ": route(0,1, 0,0, 1,0, 0,0, 0,.52, 1,.52),
  "ㅌ": route(1,1, 0,1, 0,.5, 1,.5, 0,.5, 0,0, 1,0),
  "ㅍ": route(0,1, 0,0, 1,0, 1,1, 1,.28, 0,.28, 0,.72, 1,.72),
  "ㅎ": route(.5,1, .18,.88, .05,.6, .18,.34, .5,.24, .82,.34, .95,.6, .82,.88, .5,1, .5,.24, 0,.15, 1,.15, .5,.15, .5,0),
  "ㅏ": route(.35,1, .35,.5, 1,.5, .35,.5, .35,0),
  "ㅑ": route(.25,1, .25,.68, 1,.68, .25,.68, .25,.32, 1,.32, .25,.32, .25,0),
  "ㅓ": route(.65,1, .65,.5, 0,.5, .65,.5, .65,0),
  "ㅕ": route(.75,1, .75,.68, 0,.68, .75,.68, .75,.32, 0,.32, .75,.32, .75,0),
  "ㅗ": route(0,1, .5,1, .5,0, .5,1, 1,1),
  "ㅛ": route(0,1, .35,1, .35,0, .35,1, .65,1, .65,0, .65,1, 1,1),
  "ㅜ": route(.5,1, .5,0, 0,0, 1,0),
  "ㅠ": route(.35,1, .35,0, 0,0, 1,0, .65,0, .65,1),
  "ㅡ": route(0,.5, 1,.5),
  "ㅣ": route(.5,1, .5,0),
  "ㅐ": route(.2,1, .2,.5, .62,.5, .2,.5, .2,0, .62,0, .62,1),
  "ㅒ": route(.15,1, .15,.68, .55,.68, .15,.68, .15,.32, .55,.32, .15,.32, .15,0, .7,0, .7,1),
  "ㅔ": route(.8,1, .8,0, .35,0, .35,.5, 0,.5, .35,.5, .35,1),
  "ㅖ": route(.85,1, .85,0, .35,0, .35,.32, 0,.32, .35,.32, .35,.68, 0,.68, .35,.68, .35,1),
  "ㅢ": route(.5,1, .5,.25, 0,.25, 1,.25),
  "ㅚ": route(.8,1, .8,.25, 0,.25, .5,.25, .5,0, .5,.25, 1,.25),
  "ㅟ": route(.8,1, .8,0, 0,0, .5,0, .5,.68, .5,0, 1,0),
};

export function defineJamoObstacleTemplate(template: JamoObstacleTemplate): JamoObstacleTemplate {
  const normalizedPath = CANONICAL_JAMO_ROUTES[template.symbol] ?? template.normalizedPath;
  if (!template.templateId.trim() || !template.symbol.trim()) throw new Error("Obstacle template ID and symbol are required.");
  if (normalizedPath.length < 2) throw new Error(`${template.templateId} requires at least two path points.`);
  for (const point of normalizedPath) {
    if (![point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
      throw new RangeError(`${template.templateId} path coordinates must be normalized to 0..1.`);
    }
  }
  if (template.visualBounds.width <= 0 || template.visualBounds.height <= 0) {
    throw new RangeError(`${template.templateId} visual bounds must be positive.`);
  }
  if (template.penaltyMs <= 0 || template.fallDurationMs <= 0) {
    throw new RangeError(`${template.templateId} timing must be positive.`);
  }
  return Object.freeze({
    ...template,
    entryOffset: normalizedPath[0]!,
    exitOffset: normalizedPath[normalizedPath.length - 1]!,
    penaltyMs: Math.round(template.penaltyMs * JAMO_TRAVERSAL_DURATION_SCALE),
    normalizedPath: Object.freeze([...normalizedPath]),
  });
}
