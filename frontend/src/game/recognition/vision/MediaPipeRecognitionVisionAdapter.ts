import { AdaptiveHandLandmarker, AdaptivePoseLandmarker } from "../../../shared/mediapipe";
import type { RecognitionVisionAdapter, RecognitionVisionAdapterFactory, RecognitionVisionAdapterOptions, RecognitionVisionFrame, RecognitionVisionExecutionMode } from "./RecognitionVisionAdapter";

export class MediaPipeRecognitionVisionAdapter implements RecognitionVisionAdapter {
  private readonly handLandmarker: AdaptiveHandLandmarker;
  private readonly poseLandmarker: AdaptivePoseLandmarker | null;
  private poseInitialization: Promise<void> | null = null;

  constructor(private readonly options: RecognitionVisionAdapterOptions) {
    this.handLandmarker = new AdaptiveHandLandmarker(undefined, options.handDetectionConfig, options.preferWorker);
    this.poseLandmarker = options.enablePoseTracking
      ? new AdaptivePoseLandmarker(options.maximumTrackedPeople)
      : null;
  }

  async initialize(): Promise<void> {
    await this.handLandmarker.initialize();
  }

  detectHands(frame: RecognitionVisionFrame) {
    return this.handLandmarker.detect(frame.video, frame.timestamp, frame.frameId);
  }

  async detectPoses(frame: RecognitionVisionFrame) {
    if (!this.poseLandmarker) return [];
    this.poseInitialization ??= this.poseLandmarker.initialize();
    await this.poseInitialization;
    return this.poseLandmarker.detect(frame.video, frame.timestamp, frame.frameId);
  }

  getExecutionMode(): RecognitionVisionExecutionMode {
    return this.handLandmarker.getMode();
  }

  close(): void {
    this.handLandmarker.close();
    this.poseLandmarker?.close();
    this.poseInitialization = null;
  }
}

export const mediaPipeRecognitionVisionAdapterFactory: RecognitionVisionAdapterFactory = Object.freeze({
  create: (options: RecognitionVisionAdapterOptions) => new MediaPipeRecognitionVisionAdapter(options),
});
