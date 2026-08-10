import type { ActiveHandDetectionConfig } from "../active-player";
import type { RecognitionRateConfig } from "./RecognitionRateConfig";

export type RecognitionPerformanceProfileName = "HIGH" | "BALANCED" | "LOW_POWER";

export interface RecognitionPerformanceProfile {
  readonly name: RecognitionPerformanceProfileName;
  readonly rates: RecognitionRateConfig;
  readonly maximumTrackedPeople: number;
  readonly handDetection: ActiveHandDetectionConfig;
}

export const RECOGNITION_PERFORMANCE_PROFILES: Readonly<Record<RecognitionPerformanceProfileName, RecognitionPerformanceProfile>> = Object.freeze({
  HIGH: Object.freeze({
    name: "HIGH",
    rates: Object.freeze({ renderFps: 60, handTrackingFps: 30, poseTrackingFps: 12, aiInferenceFps: 15 }),
    maximumTrackedPeople: 4,
    handDetection: Object.freeze({ maximumDetectedHands: 4, minimumHandDetectionConfidence: .6, minimumHandPresenceConfidence: .6, minimumTrackingConfidence: .6 }),
  }),
  BALANCED: Object.freeze({
    name: "BALANCED",
    rates: Object.freeze({ renderFps: 30, handTrackingFps: 24, poseTrackingFps: 8, aiInferenceFps: 12 }),
    maximumTrackedPeople: 4,
    handDetection: Object.freeze({ maximumDetectedHands: 4, minimumHandDetectionConfidence: .6, minimumHandPresenceConfidence: .6, minimumTrackingConfidence: .6 }),
  }),
  LOW_POWER: Object.freeze({
    name: "LOW_POWER",
    rates: Object.freeze({ renderFps: 30, handTrackingFps: 18, poseTrackingFps: 6, aiInferenceFps: 8 }),
    maximumTrackedPeople: 2,
    handDetection: Object.freeze({ maximumDetectedHands: 2, minimumHandDetectionConfidence: .6, minimumHandPresenceConfidence: .6, minimumTrackingConfidence: .6 }),
  }),
});

export const DEFAULT_RECOGNITION_PERFORMANCE_PROFILE = RECOGNITION_PERFORMANCE_PROFILES.BALANCED;
