import type { HandLandmark } from "../types/landmark";
import { validateLandmarks } from "../feedback/normalizeLandmarks";
import {
  MIN_TEMPLATE_SAMPLE_COUNT,
  NORMALIZATION_VERSION,
  REFERENCE_TEMPLATE_VERSION,
  type FeedbackMode,
  type ReferenceTemplate,
  type TemplateCreationInput,
  type TemplateHandedness,
} from "./types";

export function createReferenceTemplate(input: TemplateCreationInput): ReferenceTemplate {
  if (input.symbol.trim().length === 0) throw new TypeError("Template symbol must be non-empty");
  if (input.samples.length < MIN_TEMPLATE_SAMPLE_COUNT) {
    throw new RangeError(`At least ${MIN_TEMPLATE_SAMPLE_COUNT} normalized samples are required`);
  }
  input.samples.forEach(validateLandmarks);
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(createdAt))) throw new TypeError("createdAt must be an ISO date string");
  return {
    version: REFERENCE_TEMPLATE_VERSION,
    symbol: input.symbol,
    handedness: input.handedness,
    feedbackMode: input.feedbackMode,
    sampleCount: input.samples.length,
    createdAt,
    landmarks: medianLandmarks(input.samples),
    normalizationVersion: NORMALIZATION_VERSION,
  };
}

export function medianLandmarks(
  samples: readonly (readonly HandLandmark[])[],
): readonly HandLandmark[] {
  if (samples.length === 0) throw new RangeError("At least one normalized sample is required");
  samples.forEach(validateLandmarks);
  return Array.from({ length: 21 }, (_, index) => ({
    x: median(samples.map((sample) => coordinateAt(sample, index, "x"))),
    y: median(samples.map((sample) => coordinateAt(sample, index, "y"))),
    z: median(samples.map((sample) => coordinateAt(sample, index, "z"))),
  }));
}

export function serializeReferenceTemplate(template: ReferenceTemplate): string {
  validateReferenceTemplate(template);
  return JSON.stringify(template, null, 2);
}

export function deserializeReferenceTemplate(serialized: string): ReferenceTemplate {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new SyntaxError("Template JSON is invalid");
  }
  return parseReferenceTemplate(value);
}

export function validateReferenceTemplate(template: ReferenceTemplate): void {
  if (template.version !== REFERENCE_TEMPLATE_VERSION) {
    throw new RangeError(`Unsupported template version: ${template.version}`);
  }
  if (template.normalizationVersion !== NORMALIZATION_VERSION) {
    throw new RangeError(`Unsupported normalization version: ${template.normalizationVersion}`);
  }
  if (template.symbol.trim().length === 0) throw new TypeError("Template symbol must be non-empty");
  if (template.handedness !== "LEFT" && template.handedness !== "RIGHT") throw new TypeError("Invalid template handedness");
  if (template.feedbackMode !== "STATIC_TEMPLATE" && template.feedbackMode !== "CLASSIFICATION_ONLY") throw new TypeError("Invalid feedback mode");
  if (!Number.isInteger(template.sampleCount) || template.sampleCount < MIN_TEMPLATE_SAMPLE_COUNT) {
    throw new RangeError(`sampleCount must be at least ${MIN_TEMPLATE_SAMPLE_COUNT}`);
  }
  if (!Number.isFinite(Date.parse(template.createdAt))) throw new TypeError("createdAt must be an ISO date string");
  validateLandmarks(template.landmarks);
}

function parseReferenceTemplate(value: unknown): ReferenceTemplate {
  if (!isRecord(value)) throw new TypeError("Template JSON must be an object");
  const landmarks = parseLandmarks(value.landmarks);
  const template: ReferenceTemplate = {
    version: requiredVersion(value.version),
    symbol: requiredString(value.symbol, "symbol"),
    handedness: requiredHandedness(value.handedness),
    feedbackMode: requiredFeedbackMode(value.feedbackMode),
    sampleCount: requiredPositiveInteger(value.sampleCount, "sampleCount"),
    createdAt: requiredString(value.createdAt, "createdAt"),
    landmarks,
    normalizationVersion: requiredNormalizationVersion(value.normalizationVersion),
  };
  validateReferenceTemplate(template);
  return template;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function coordinateAt(sample: readonly HandLandmark[], index: number, axis: keyof HandLandmark): number {
  const landmark = sample[index];
  if (!landmark) throw new RangeError(`Missing landmark ${index}`);
  return landmark[axis];
}

function parseLandmarks(value: unknown): readonly HandLandmark[] {
  if (!Array.isArray(value)) throw new TypeError("landmarks must be an array");
  const landmarks = value.map((item, index) => {
    if (!isRecord(item)) throw new TypeError(`landmarks[${index}] must be an object`);
    return {
      x: requiredFiniteNumber(item.x, `landmarks[${index}].x`),
      y: requiredFiniteNumber(item.y, `landmarks[${index}].y`),
      z: requiredFiniteNumber(item.z, `landmarks[${index}].z`),
    };
  });
  validateLandmarks(landmarks);
  return landmarks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${field} must be a non-empty string`);
  return value;
}

function requiredFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${field} must be finite`);
  return value;
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new RangeError(`${field} must be a positive integer`);
  return value;
}

function requiredVersion(value: unknown): typeof REFERENCE_TEMPLATE_VERSION {
  if (value !== REFERENCE_TEMPLATE_VERSION) throw new RangeError("Unsupported template version");
  return value;
}

function requiredNormalizationVersion(value: unknown): typeof NORMALIZATION_VERSION {
  if (value !== NORMALIZATION_VERSION) throw new RangeError("Unsupported normalization version");
  return value;
}

function requiredHandedness(value: unknown): TemplateHandedness {
  if (value !== "LEFT" && value !== "RIGHT") throw new TypeError("Invalid template handedness");
  return value;
}

function requiredFeedbackMode(value: unknown): FeedbackMode {
  if (value !== "STATIC_TEMPLATE" && value !== "CLASSIFICATION_ONLY") throw new TypeError("Invalid feedback mode");
  return value;
}
