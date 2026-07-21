import type { ActiveHandDetectionConfig, PoseDetection } from "../active-player";
import type { TrackedHand } from "../../../shared/mediapipe";

export type { TrackedHand } from "../../../shared/mediapipe";

export type RecognitionVisionExecutionMode = "WORKER" | "MAIN_THREAD" | "REMOTE";

export interface RecognitionVisionAdapterOptions {
  readonly handDetectionConfig: ActiveHandDetectionConfig;
  readonly maximumTrackedPeople: number;
  readonly enablePoseTracking: boolean;
  readonly preferWorker: boolean;
}

export interface RecognitionVisionFrame {
  readonly video: HTMLVideoElement;
  readonly timestamp: number;
  readonly frameId: number;
}

/**
 * Frontend-owned boundary for extracting vision data from camera frames.
 * Implementations may run MediaPipe in the browser or delegate frames to a
 * remote AI service. Recognition/game code must depend on this port only.
 */
export interface RecognitionVisionAdapter {
  initialize(): Promise<void>;
  detectHands(frame: RecognitionVisionFrame): Promise<readonly TrackedHand[]>;
  detectPoses(frame: RecognitionVisionFrame): Promise<readonly PoseDetection[]>;
  getExecutionMode(): RecognitionVisionExecutionMode;
  close(): void;
}

export interface RecognitionVisionAdapterFactory {
  create(options: RecognitionVisionAdapterOptions): RecognitionVisionAdapter;
}
