export interface RecognitionRateConfig {
  readonly renderFps: number;
  readonly handTrackingFps: number;
  readonly poseTrackingFps: number;
  readonly aiInferenceFps: number;
}

export const DEFAULT_RECOGNITION_RATE_CONFIG: RecognitionRateConfig = Object.freeze({
  renderFps: 30,
  // 24 Hz: 30 Hz was tried (2026-08-10) and caused severe jank on the demo
  // machine — the extra inference/bitmap work contends with page rendering.
  handTrackingFps: 24,
  poseTrackingFps: 8,
  aiInferenceFps: 18,
});

export const LOW_POWER_RECOGNITION_RATE_CONFIG: RecognitionRateConfig = Object.freeze({
  renderFps: 30,
  handTrackingFps: 18,
  poseTrackingFps: 6,
  aiInferenceFps: 8,
});

/** Active game screens favour response time; stale work is dropped. */
export const RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG: RecognitionRateConfig = Object.freeze({
  // A 24 Hz latest-only tracker has lower end-to-end latency than an overloaded
  // 30/60 Hz queue and leaves the main thread available for game physics.
  renderFps: 20,
  handTrackingFps: 24,
  poseTrackingFps: 4,
  aiInferenceFps: 18,
});

export function validateRecognitionRateConfig(config: RecognitionRateConfig): RecognitionRateConfig {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value <= 0 || value > 120) throw new RangeError(`${name} must be between 0 and 120 FPS.`);
  }
  return config;
}
