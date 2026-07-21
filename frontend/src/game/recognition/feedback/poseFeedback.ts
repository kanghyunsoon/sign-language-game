import type { HandLandmark, Handedness } from "../types/landmark";
import type { ReferenceTemplate } from "../template/types";
import { HAND_BONES } from "./handConnections";
import { normalizeLandmarks, validateLandmarks } from "./normalizeLandmarks";
import type { BoneFeedback, BoneFeedbackStatus, PoseFeedbackConfig } from "./types";
import { VECTOR_EPSILON, subtractVector, vectorLength } from "./vector";

export const DEFAULT_POSE_FEEDBACK_CONFIG: PoseFeedbackConfig = {
  correctAngleDegrees: 10,
  closeAngleDegrees: 25,
  correctLengthError: 0.08,
  closeLengthError: 0.2,
  angleWeight: 0.65,
  lengthWeight: 0.35,
};

export type FeedbackAvailability = "AVAILABLE" | "TEMPLATE_MISSING" | "CLASSIFICATION_ONLY" | "HANDEDNESS_UNKNOWN";

export interface PoseFeedbackResult {
  readonly availability: FeedbackAvailability;
  readonly feedback: readonly BoneFeedback[];
  readonly guidance: readonly string[];
}

export function compareTemplateToCurrentLandmarks(
  currentLandmarks: readonly HandLandmark[],
  handedness: Handedness,
  template: ReferenceTemplate | null,
  config: PoseFeedbackConfig = DEFAULT_POSE_FEEDBACK_CONFIG,
): PoseFeedbackResult {
  if (template === null) return unavailable("TEMPLATE_MISSING");
  if (template.feedbackMode === "CLASSIFICATION_ONLY") return unavailable("CLASSIFICATION_ONLY");
  if (handedness === "UNKNOWN") return unavailable("HANDEDNESS_UNKNOWN");
  const normalizedCurrent = normalizeLandmarks(currentLandmarks, { handedness });
  return compareNormalizedLandmarks(normalizedCurrent, template.landmarks, config);
}

export function compareNormalizedLandmarks(
  currentLandmarks: readonly HandLandmark[],
  referenceLandmarks: readonly HandLandmark[],
  config: PoseFeedbackConfig = DEFAULT_POSE_FEEDBACK_CONFIG,
): PoseFeedbackResult {
  validateLandmarks(currentLandmarks);
  validateLandmarks(referenceLandmarks);
  validateConfig(config);
  const feedback = HAND_BONES.map((bone) => {
    const currentVector = boneVector(currentLandmarks, bone.startIndex, bone.endIndex);
    const referenceVector = boneVector(referenceLandmarks, bone.startIndex, bone.endIndex);
    const angleError = angleBetweenDegrees(currentVector, referenceVector);
    const referenceLength = vectorLength(referenceVector);
    const currentLength = vectorLength(currentVector);
    const lengthError = referenceLength <= VECTOR_EPSILON
      ? Number.POSITIVE_INFINITY
      : Math.abs(currentLength - referenceLength) / referenceLength;
    const status = feedbackStatus(angleError, lengthError, config);
    return {
      boneId: bone.id,
      finger: bone.finger,
      angleError,
      lengthError,
      errorScore: errorScore(angleError, lengthError, config),
      status,
    } satisfies BoneFeedback;
  });
  return { availability: "AVAILABLE", feedback, guidance: guidanceForFeedback(feedback) };
}

export function feedbackStatus(
  angleError: number,
  lengthError: number,
  config: PoseFeedbackConfig = DEFAULT_POSE_FEEDBACK_CONFIG,
): BoneFeedbackStatus {
  if (angleError <= config.correctAngleDegrees && lengthError <= config.correctLengthError) return "CORRECT";
  if (angleError <= config.closeAngleDegrees && lengthError <= config.closeLengthError) return "CLOSE";
  return "WRONG";
}

export function guidanceForFeedback(feedback: readonly BoneFeedback[]): readonly string[] {
  const scores = new Map<BoneFeedback["finger"], number>();
  for (const item of feedback) {
    if (item.finger === "PALM" || item.status === "CORRECT") continue;
    scores.set(item.finger, (scores.get(item.finger) ?? 0) + item.errorScore);
  }
  const focusedFinger = [...scores.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!focusedFinger) return [];
  switch (focusedFinger) {
    case "THUMB": return ["엄지를 안쪽으로 이동하세요."];
    case "INDEX": return ["검지를 조금 더 펴세요."];
    case "MIDDLE": return ["중지를 조금 더 펴세요."];
    case "RING": return ["약지를 조금 더 구부리세요."];
    case "PINKY": return ["새끼손가락 위치를 맞추세요."];
    case "PALM": return [];
  }
}

function unavailable(availability: Exclude<FeedbackAvailability, "AVAILABLE">): PoseFeedbackResult {
  return { availability, feedback: [], guidance: [] };
}

function boneVector(landmarks: readonly HandLandmark[], startIndex: number, endIndex: number): HandLandmark {
  const start = landmarks[startIndex];
  const end = landmarks[endIndex];
  if (!start || !end) throw new RangeError("Missing bone landmark");
  return subtractVector(end, start);
}

function angleBetweenDegrees(left: HandLandmark, right: HandLandmark): number {
  const leftLength = vectorLength(left);
  const rightLength = vectorLength(right);
  if (leftLength <= VECTOR_EPSILON || rightLength <= VECTOR_EPSILON) return 180;
  const dot = left.x * right.x + left.y * right.y + left.z * right.z;
  const cosine = Math.max(-1, Math.min(1, dot / (leftLength * rightLength)));
  return Math.acos(cosine) * 180 / Math.PI;
}

function errorScore(angleError: number, lengthError: number, config: PoseFeedbackConfig): number {
  return config.angleWeight * angleError / config.closeAngleDegrees
    + config.lengthWeight * lengthError / config.closeLengthError;
}

function validateConfig(config: PoseFeedbackConfig): void {
  const values = Object.values(config);
  if (!values.every((value) => Number.isFinite(value) && value > 0)) throw new TypeError("Pose feedback configuration must contain positive finite values");
  if (config.correctAngleDegrees > config.closeAngleDegrees || config.correctLengthError > config.closeLengthError) {
    throw new RangeError("Correct thresholds must not exceed close thresholds");
  }
}
