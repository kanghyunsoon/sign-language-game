import type { HandLandmark, Handedness } from "../types/landmark";
import type { LandmarkNormalizationOptions, NormalizedLandmark } from "./types";
import {
  rotateVectorAroundZ,
  scaleVector,
  subtractVector,
  VECTOR_EPSILON,
  vectorLength,
} from "./vector";

export const HAND_LANDMARK_COUNT = 21;
export const WRIST_INDEX = 0;
export const MIDDLE_MCP_INDEX = 9;

export function validateLandmarks(landmarks: readonly HandLandmark[]): void {
  if (landmarks.length !== HAND_LANDMARK_COUNT) {
    throw new RangeError(`Expected ${HAND_LANDMARK_COUNT} landmarks, received ${landmarks.length}`);
  }
  if (!landmarks.every(({ x, y, z }) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) {
    throw new TypeError("Landmark coordinates must be finite numbers");
  }
}

export function translateToWristOrigin(landmarks: readonly HandLandmark[]): readonly NormalizedLandmark[] {
  validateLandmarks(landmarks);
  const wrist = landmarks[WRIST_INDEX];
  if (!wrist) throw new RangeError("Missing wrist landmark");
  return landmarks.map((landmark) => subtractVector(landmark, wrist));
}

export function normalizeHandScale(landmarks: readonly HandLandmark[]): readonly NormalizedLandmark[] {
  validateLandmarks(landmarks);
  const wrist = landmarks[WRIST_INDEX];
  const middleMcp = landmarks[MIDDLE_MCP_INDEX];
  if (!wrist || !middleMcp) throw new RangeError("Missing palm scale landmarks");
  const palmLength = vectorLength(subtractVector(middleMcp, wrist));
  if (palmLength <= VECTOR_EPSILON) {
    throw new RangeError("Palm reference length must be greater than zero");
  }
  return landmarks.map((landmark) => scaleVector(landmark, 1 / palmLength));
}

export function normalizeHandRotation(landmarks: readonly HandLandmark[]): readonly NormalizedLandmark[] {
  validateLandmarks(landmarks);
  const wrist = landmarks[WRIST_INDEX];
  const middleMcp = landmarks[MIDDLE_MCP_INDEX];
  if (!wrist || !middleMcp) throw new RangeError("Missing rotation landmarks");
  const direction = subtractVector(middleMcp, wrist);
  const planarLength = Math.hypot(direction.x, direction.y);
  if (planarLength <= VECTOR_EPSILON) {
    throw new RangeError("Palm reference direction must have non-zero x/y length");
  }
  const rotation = Math.PI / 2 - Math.atan2(direction.y, direction.x);
  return landmarks.map((landmark) => rotateVectorAroundZ(landmark, rotation));
}

export function normalizeHandedness(
  landmarks: readonly HandLandmark[],
  handedness: Handedness,
): readonly NormalizedLandmark[] {
  validateLandmarks(landmarks);
  return landmarks.map((landmark) => ({
    x: handedness === "LEFT" ? -landmark.x : landmark.x,
    y: landmark.y,
    z: landmark.z,
  }));
}

export function normalizeLandmarks(
  landmarks: readonly HandLandmark[],
  options: LandmarkNormalizationOptions,
): readonly NormalizedLandmark[] {
  const depthWeight = options.depthWeight ?? 1;
  if (!Number.isFinite(depthWeight)) throw new TypeError("depthWeight must be finite");
  const translated = translateToWristOrigin(landmarks);
  const scaled = normalizeHandScale(translated);
  const rotated = normalizeHandRotation(scaled);
  const handednessNormalized = normalizeHandedness(rotated, options.handedness);
  return handednessNormalized.map((landmark) => ({ ...landmark, z: landmark.z * depthWeight }));
}
