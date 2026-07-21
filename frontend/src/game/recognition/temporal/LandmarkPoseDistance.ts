import type { NormalizedLandmark } from "./signDecoderTypes";

export interface LandmarkPoseDistance {
  calculate(reference: readonly NormalizedLandmark[], current: readonly NormalizedLandmark[]): number;
}

const FINGER_CHAINS = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]] as const;

export class NormalizedLandmarkPoseDistance implements LandmarkPoseDistance {
  calculate(reference: readonly NormalizedLandmark[], current: readonly NormalizedLandmark[]): number {
    if (reference.length !== 21 || current.length !== 21) return Number.POSITIVE_INFINITY;
    const left = normalizePose(reference);
    const right = normalizePose(current);
    const coordinateDistance = Math.sqrt(left.reduce((sum, point, index) => {
      const other = right[index]!;
      return sum + squared(point.x - other.x) + squared(point.y - other.y) + squared(point.z - other.z);
    }, 0) / left.length);
    const leftAngles = jointAngles(left);
    const rightAngles = jointAngles(right);
    const angleDistance = leftAngles.reduce((sum, angle, index) => sum + Math.abs(angle - rightAngles[index]!), 0) / (leftAngles.length * Math.PI);
    return coordinateDistance * 0.6 + angleDistance * 0.4;
  }
}

export function palmScale(landmarks: readonly NormalizedLandmark[]): number {
  if (landmarks.length !== 21) return 1;
  const wristToMiddle = distance(landmarks[0]!, landmarks[9]!);
  const palmWidth = distance(landmarks[5]!, landmarks[17]!);
  return Math.max(1e-6, (wristToMiddle + palmWidth) / 2);
}

function normalizePose(landmarks: readonly NormalizedLandmark[]): NormalizedLandmark[] {
  const wrist = landmarks[0]!;
  const scale = palmScale(landmarks);
  const middle = landmarks[9]!;
  const angle = Math.atan2(middle.y - wrist.y, middle.x - wrist.x);
  const rotation = Math.PI / 2 - angle;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rotated = landmarks.map((point) => {
    const x = (point.x - wrist.x) / scale;
    const y = (point.y - wrist.y) / scale;
    return { x: x * cos - y * sin, y: x * sin + y * cos, z: (point.z - wrist.z) / scale };
  });
  const shouldMirror = rotated[5]!.x > rotated[17]!.x;
  return shouldMirror ? rotated.map((point) => ({ ...point, x: -point.x })) : rotated;
}

function jointAngles(points: readonly NormalizedLandmark[]): number[] {
  const values: number[] = [];
  FINGER_CHAINS.forEach((chain) => {
    for (let index = 1; index < chain.length - 1; index += 1) {
      values.push(angleAt(points[chain[index - 1]!]!, points[chain[index]!]!, points[chain[index + 1]!]!));
    }
  });
  return values;
}

function angleAt(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const cb = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const denominator = Math.sqrt(squared(ab.x) + squared(ab.y) + squared(ab.z)) * Math.sqrt(squared(cb.x) + squared(cb.y) + squared(cb.z));
  if (denominator <= 1e-9) return 0;
  return Math.acos(clamp((ab.x * cb.x + ab.y * cb.y + ab.z * cb.z) / denominator, -1, 1));
}

function distance(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.sqrt(squared(a.x - b.x) + squared(a.y - b.y) + squared(a.z - b.z));
}
function squared(value: number): number { return value * value; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
