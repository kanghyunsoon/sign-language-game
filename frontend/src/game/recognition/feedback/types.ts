import type { HandLandmark, Handedness } from "../types/landmark";

export type NormalizedLandmark = HandLandmark;

export interface HandBone {
  readonly id: string;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly finger: "THUMB" | "INDEX" | "MIDDLE" | "RING" | "PINKY" | "PALM";
}

export interface LandmarkNormalizationOptions {
  readonly handedness: Handedness;
  readonly depthWeight?: number;
}

export type BoneFeedbackStatus = "CORRECT" | "CLOSE" | "WRONG";

export interface BoneFeedback {
  readonly boneId: string;
  readonly finger: HandBone["finger"];
  readonly angleError: number;
  readonly lengthError: number;
  readonly errorScore: number;
  readonly status: BoneFeedbackStatus;
}

export interface PoseFeedbackConfig {
  readonly correctAngleDegrees: number;
  readonly closeAngleDegrees: number;
  readonly correctLengthError: number;
  readonly closeLengthError: number;
  readonly angleWeight: number;
  readonly lengthWeight: number;
}
