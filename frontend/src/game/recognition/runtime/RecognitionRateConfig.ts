export interface RecognitionRateConfig {
  readonly renderFps: number;
  readonly handTrackingFps: number;
  readonly poseTrackingFps: number;
  readonly aiInferenceFps: number;
}

export const DEFAULT_RECOGNITION_RATE_CONFIG: RecognitionRateConfig = Object.freeze({
  renderFps: 60,
  handTrackingFps: 30,
  poseTrackingFps: 8,
  aiInferenceFps: 12,
});

export const LOW_POWER_RECOGNITION_RATE_CONFIG: RecognitionRateConfig = Object.freeze({
  renderFps: 30,
  handTrackingFps: 18,
  poseTrackingFps: 6,
  aiInferenceFps: 8,
});

export function validateRecognitionRateConfig(config: RecognitionRateConfig): RecognitionRateConfig {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value <= 0 || value > 120) throw new RangeError(`${name} must be between 0 and 120 FPS.`);
  }
  return config;
}
