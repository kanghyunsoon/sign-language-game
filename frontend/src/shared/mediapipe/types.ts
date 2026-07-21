export interface NormalizedLandmark3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type Handedness = "LEFT" | "RIGHT" | "UNKNOWN";

export interface TrackedHand {
  readonly handedness: Handedness;
  readonly handednessScore: number;
  readonly landmarks: readonly NormalizedLandmark3D[];
}

export interface HandDetectionConfig {
  readonly maximumDetectedHands: number;
  readonly minimumHandDetectionConfidence: number;
  readonly minimumHandPresenceConfidence: number;
  readonly minimumTrackingConfidence: number;
}

export const DEFAULT_HAND_DETECTION_CONFIG: HandDetectionConfig = Object.freeze({
  // Keep enough candidates for ownership resolution when another person enters
  // the camera. The game chooses its active player after MediaPipe detection.
  maximumDetectedHands: 4,
  minimumHandDetectionConfidence: 0.5,
  minimumHandPresenceConfidence: 0.5,
  minimumTrackingConfidence: 0.5,
});

export interface NormalizedBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PoseLandmark extends NormalizedLandmark3D {
  readonly visibility?: number;
  readonly presence?: number;
}

export interface PoseDetection {
  readonly boundingBox: NormalizedBoundingBox;
  readonly poseLandmarks: readonly PoseLandmark[];
  readonly torsoColorHistogram?: Float32Array;
}
