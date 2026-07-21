import type { HandLandmark } from "../types/landmark";

export const REFERENCE_TEMPLATE_VERSION = "reference-template-v1";
export const NORMALIZATION_VERSION = "wrist-middle-mcp-rotation-handedness-v1";
export const MIN_TEMPLATE_SAMPLE_COUNT = 20;

export type TemplateHandedness = "LEFT" | "RIGHT";
export type FeedbackMode = "STATIC_TEMPLATE" | "CLASSIFICATION_ONLY";

export interface ReferenceTemplate {
  readonly version: typeof REFERENCE_TEMPLATE_VERSION;
  readonly symbol: string;
  readonly handedness: TemplateHandedness;
  readonly feedbackMode: FeedbackMode;
  readonly sampleCount: number;
  readonly createdAt: string;
  readonly landmarks: readonly HandLandmark[];
  readonly normalizationVersion: typeof NORMALIZATION_VERSION;
}

export interface TemplateCreationInput {
  readonly symbol: string;
  readonly handedness: TemplateHandedness;
  readonly feedbackMode: FeedbackMode;
  readonly samples: readonly (readonly HandLandmark[])[];
  readonly createdAt?: string;
}
