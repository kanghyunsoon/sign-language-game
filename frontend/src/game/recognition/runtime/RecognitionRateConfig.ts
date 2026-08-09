export interface RecognitionRateConfig {
  readonly renderFps: number;
  readonly handTrackingFps: number;
  readonly poseTrackingFps: number;
  readonly aiInferenceFps: number;
}

export const DEFAULT_RECOGNITION_RATE_CONFIG: RecognitionRateConfig = Object.freeze({
  renderFps: 30,
  // 30 Hz: the worker consumes 256px bitmaps, so per-frame cost is small and
  // the latest-only buffer drops stale frames instead of queueing them. One
  // extra tracked frame per render frame cuts perceived skeleton latency.
  handTrackingFps: 30,
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
  // A latest-only tracker has lower end-to-end latency than an overloaded
  // queue and leaves the main thread available for game physics.
  renderFps: 20,
  handTrackingFps: 30,
  poseTrackingFps: 4,
  aiInferenceFps: 18,
});

export function validateRecognitionRateConfig(config: RecognitionRateConfig): RecognitionRateConfig {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isFinite(value) || value <= 0 || value > 120) throw new RangeError(`${name} must be between 0 and 120 FPS.`);
  }
  return config;
}
