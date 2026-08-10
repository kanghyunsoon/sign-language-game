import type { HandLandmark } from "../types/landmark";

export interface DisplayLandmarkSample {
  readonly landmarks: readonly HandLandmark[];
  readonly capturedAt: number;
}

const MAX_LEAD_MS = 150;
const MAX_SAMPLE_LEAD_MULTIPLIER = 4;
// 클램프는 외삽이 튀는 것을 막는 안전벨트다. 이전 값(0.065/0.018)은 빠른 손
// 이동에서 보상량 자체를 잘라내 스켈레톤이 항상 뒤처졌다. 화면 폭의 14%면
// 24-30Hz 추적에서 실제 손이 한 샘플 사이에 움직일 수 있는 상한에 가깝다.
const MAX_GLOBAL_XY_OFFSET = 0.14;
const MAX_GLOBAL_Z_OFFSET = 0.15;
const MAX_ARTICULATION_XY_OFFSET = 0.04;
const MAX_ARTICULATION_Z_OFFSET = 0.05;
const MOTION_DEAD_ZONE = 0.0015;
// 관절(손가락) 움직임 반영 비율. 0.45는 손가락 변화가 절반 이하로만 보상돼
// 손모양 전환이 눈에 띄게 늦었다.
const ARTICULATION_LEAD_SCALE = 0.7;
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
    const articulationScale = Math.hypot(articulationX, articulationY) < MOTION_DEAD_ZONE ? 0 : ARTICULATION_LEAD_SCALE;
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
 *
 * The base alphas trade jitter for lag. The original 0.32/0.24 held slow and
 * medium motion to a third of its real speed — the reported "skeleton drags
 * behind the hand". 0.55/0.5 still damps sub-pixel vibration (the dead zones
 * below keep the minimum alpha only for near-still hands) while following any
 * deliberate motion almost immediately, and the full-speed distances are
 * shortened so real movement reaches alpha 1 sooner.
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
  const palmAlpha = adaptiveAlpha(palmDistance, 0.55, 0.002, 0.018);

  return current.map((point, index) => {
    const before = previous[index];
    if (!before) return point;
    const translated = {
      x: before.x + palmDx,
      y: before.y + palmDy,
      z: before.z + palmDz,
    };
    const articulationDistance = Math.hypot(point.x - translated.x, point.y - translated.y);
    const articulationAlpha = adaptiveAlpha(articulationDistance, 0.5, 0.0015, 0.016);
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
