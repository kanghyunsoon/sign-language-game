import type { HandLandmark } from "../types/landmark";

export interface DisplayLandmarkSample {
  readonly landmarks: readonly HandLandmark[];
  readonly capturedAt: number;
}

const MAX_LEAD_MS = 150;
const MAX_SAMPLE_LEAD_MULTIPLIER = 4;
const MAX_GLOBAL_XY_OFFSET = 0.065;
const MAX_GLOBAL_Z_OFFSET = 0.075;
const MAX_ARTICULATION_XY_OFFSET = 0.018;
const MAX_ARTICULATION_Z_OFFSET = 0.024;
const MOTION_DEAD_ZONE = 0.0015;
const PALM_ANCHOR_INDICES = [0, 5, 9, 13, 17] as const;

/**
 * Compensates only the visual skeleton for camera/inference latency.
 * Recognition continues to receive the measured landmarks unchanged.
 */
export function predictLandmarksForDisplay(
  previous: DisplayLandmarkSample | undefined,
  current: DisplayLandmarkSample,
  displayedAt: number,
): readonly HandLandmark[] {
  if (!previous || previous.landmarks.length !== current.landmarks.length) {
    return current.landmarks;
  }

  const sampleDuration = current.capturedAt - previous.capturedAt;
  if (sampleDuration <= 0 || sampleDuration > 200) return current.landmarks;

  const leadMs = Math.min(
    MAX_LEAD_MS,
    sampleDuration * MAX_SAMPLE_LEAD_MULTIPLIER,
    Math.max(0, displayedAt - current.capturedAt),
  );
  if (leadMs === 0) return current.landmarks;
  const leadRatio = leadMs / sampleDuration;
  const globalMotion = averageMotion(previous.landmarks, current.landmarks, PALM_ANCHOR_INDICES);

  return current.landmarks.map((point, index) => {
    const before = previous.landmarks[index];
    if (!before) return point;
    const dx = point.x - before.x;
    const dy = point.y - before.y;
    const dz = point.z - before.z;
    const articulationX = dx - globalMotion.x;
    const articulationY = dy - globalMotion.y;
    const articulationZ = dz - globalMotion.z;
    const articulationScale = Math.hypot(articulationX, articulationY) < MOTION_DEAD_ZONE ? 0 : 0.45;
    return {
      x: clamp01(
        point.x
          + clamp(globalMotion.x * leadRatio, -MAX_GLOBAL_XY_OFFSET, MAX_GLOBAL_XY_OFFSET)
          + clamp(articulationX * leadRatio * articulationScale, -MAX_ARTICULATION_XY_OFFSET, MAX_ARTICULATION_XY_OFFSET),
      ),
      y: clamp01(
        point.y
          + clamp(globalMotion.y * leadRatio, -MAX_GLOBAL_XY_OFFSET, MAX_GLOBAL_XY_OFFSET)
          + clamp(articulationY * leadRatio * articulationScale, -MAX_ARTICULATION_XY_OFFSET, MAX_ARTICULATION_XY_OFFSET),
      ),
      z:
        point.z
        + clamp(globalMotion.z * leadRatio, -MAX_GLOBAL_Z_OFFSET, MAX_GLOBAL_Z_OFFSET)
        + clamp(articulationZ * leadRatio * articulationScale, -MAX_ARTICULATION_Z_OFFSET, MAX_ARTICULATION_Z_OFFSET),
    };
  });
}

/**
 * Treats the hand as one articulated object: palm translation follows quickly,
 * while finger motion is smoothed relative to that palm. This prevents the 21
 * landmarks from visibly vibrating in different directions.
 */
export function stabilizeLandmarksForDisplay(
  previous: readonly HandLandmark[] | undefined,
  current: readonly HandLandmark[],
): readonly HandLandmark[] {
  if (!previous || previous.length !== current.length) return current;
  const previousPalm = averagePoints(previous, PALM_ANCHOR_INDICES);
  const currentPalm = averagePoints(current, PALM_ANCHOR_INDICES);
  const palmDx = currentPalm.x - previousPalm.x;
  const palmDy = currentPalm.y - previousPalm.y;
  const palmDz = currentPalm.z - previousPalm.z;
  const palmDistance = Math.hypot(palmDx, palmDy);
  const palmAlpha = adaptiveAlpha(palmDistance, 0.32, 0.002, 0.025);

  return current.map((point, index) => {
    const before = previous[index];
    if (!before) return point;
    const translated = {
      x: before.x + palmDx,
      y: before.y + palmDy,
      z: before.z + palmDz,
    };
    const articulationDistance = Math.hypot(point.x - translated.x, point.y - translated.y);
    const articulationAlpha = adaptiveAlpha(articulationDistance, 0.24, 0.0015, 0.022);
    return {
      x:
        before.x
        + palmDx * palmAlpha
        + (point.x - translated.x) * articulationAlpha,
      y:
        before.y
        + palmDy * palmAlpha
        + (point.y - translated.y) * articulationAlpha,
      z:
        before.z
        + palmDz * palmAlpha
        + (point.z - translated.z) * articulationAlpha,
    };
  });
}

function averageMotion(
  previous: readonly HandLandmark[],
  current: readonly HandLandmark[],
  preferredIndices: readonly number[],
): HandLandmark {
  const before = averagePoints(previous, preferredIndices);
  const after = averagePoints(current, preferredIndices);
  return { x: after.x - before.x, y: after.y - before.y, z: after.z - before.z };
}

function averagePoints(
  landmarks: readonly HandLandmark[],
  preferredIndices: readonly number[],
): HandLandmark {
  const points = preferredIndices
    .map((index) => landmarks[index])
    .filter((point): point is HandLandmark => point !== undefined);
  const source = points.length > 0 ? points : landmarks;
  if (source.length === 0) return { x: 0, y: 0, z: 0 };
  const sum = source.reduce(
    (total, point) => ({
      x: total.x + point.x,
      y: total.y + point.y,
      z: total.z + point.z,
    }),
    { x: 0, y: 0, z: 0 },
  );
  return { x: sum.x / source.length, y: sum.y / source.length, z: sum.z / source.length };
}

function adaptiveAlpha(distance: number, minimum: number, slowEnd: number, fastStart: number): number {
  if (distance <= slowEnd) return minimum;
  if (distance >= fastStart) return 1;
  return minimum + ((distance - slowEnd) / (fastStart - slowEnd)) * (1 - minimum);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
