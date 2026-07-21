import type { HandLandmark, Handedness } from "../types/landmark";

export type NormalizedLandmark = HandLandmark;

export type SignDecoderState =
  | "NO_HAND"
  | "TRACKING"
  | "MOVING"
  | "CANDIDATE"
  | "CONFIRMED"
  | "RELEASE_WAIT";

export interface SignDecoderPrediction {
  readonly symbol: string;
  readonly confidence: number;
  readonly predictedAt: number;
  readonly sequence: number;
}

export interface SignDecoderFrame {
  readonly capturedAt: number;
  readonly handPresent: boolean;
  readonly handId?: string;
  readonly handedness?: Exclude<Handedness, "UNKNOWN">;
  readonly rawLandmarks?: readonly NormalizedLandmark[];
  readonly normalizedLandmarks?: readonly NormalizedLandmark[];
  readonly prediction?: SignDecoderPrediction;
}

export interface LandmarkMotionSnapshot {
  readonly averageVelocity: number;
  readonly maximumVelocity: number;
  readonly wristVelocity: number;
  readonly fingerVelocity: number;
  readonly stableDurationMs: number;
  readonly moving: boolean;
}

export type SignDecoderEvent =
  | { readonly type: "STATE_CHANGED"; readonly previousState: SignDecoderState; readonly currentState: SignDecoderState; readonly occurredAt: number }
  | { readonly type: "CANDIDATE_CHANGED"; readonly symbol?: string; readonly confidence?: number; readonly occurredAt: number }
  | { readonly type: "SIGN_CONFIRMED"; readonly symbol: string; readonly confidence: number; readonly confirmationLatencyMs: number; readonly occurredAt: number }
  | { readonly type: "HAND_RELEASED"; readonly previousSymbol?: string; readonly occurredAt: number };

export interface SignDecoderSnapshot {
  readonly state: SignDecoderState;
  readonly motion: LandmarkMotionSnapshot;
  readonly candidateSymbol?: string;
  readonly candidateVotes: number;
  readonly predictionConfidence?: number;
  readonly lastConfirmedSymbol?: string;
  readonly releasePoseDistance: number;
  readonly lastConfirmationLatencyMs?: number;
  readonly averageConfirmationLatencyMs: number;
  readonly p95ConfirmationLatencyMs: number;
  readonly confirmations: number;
  readonly droppedPredictions: number;
  readonly stalePredictions: number;
}

export interface ContinuousSignRecognizer {
  start(): Promise<void>;
  stop(): Promise<void>;
  pushFrame(frame: SignDecoderFrame): void;
  subscribe(listener: (event: SignDecoderEvent) => void): () => void;
  getSnapshot(): SignDecoderSnapshot;
}

export const EMPTY_MOTION_SNAPSHOT: LandmarkMotionSnapshot = Object.freeze({
  averageVelocity: 0,
  maximumVelocity: 0,
  wristVelocity: 0,
  fingerVelocity: 0,
  stableDurationMs: 0,
  moving: false,
});
