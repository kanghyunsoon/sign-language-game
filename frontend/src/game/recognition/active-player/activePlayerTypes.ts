export interface NormalizedBoundingBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface PoseLandmark { readonly x: number; readonly y: number; readonly z: number; readonly visibility?: number; readonly presence?: number; }
export interface PlayerAppearanceDescriptor { readonly torsoColorHistogram: Float32Array; readonly poseProportions: Float32Array; readonly torsoAspectRatio: number; readonly shoulderWidthRatio: number; readonly capturedAt: number; }
export interface PoseDetection { readonly boundingBox: NormalizedBoundingBox; readonly poseLandmarks: readonly PoseLandmark[]; readonly torsoColorHistogram?: Float32Array; }
export type PersonTrackState = "ACTIVE" | "LOST" | "REMOVED";
export interface PersonTrack {
  readonly trackId: string;
  readonly boundingBox: NormalizedBoundingBox;
  readonly predictedBoundingBox: NormalizedBoundingBox;
  readonly poseLandmarks: readonly PoseLandmark[];
  readonly poseFeatures: Float32Array;
  readonly velocity: { readonly x: number; readonly y: number };
  readonly appearanceDescriptor?: PlayerAppearanceDescriptor;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly missedFrames: number;
  readonly state: PersonTrackState;
}
export interface PersonMatchCost { readonly positionCost: number; readonly boundingBoxCost: number; readonly poseCost: number; readonly motionCost: number; readonly appearanceCost?: number; readonly totalCost: number; }
export type ActivePlayerState = "UNREGISTERED" | "REGISTERING" | "LOCKED" | "TEMPORARILY_LOST" | "REIDENTIFYING" | "AMBIGUOUS" | "USER_LOST";
export interface ActivePlayerMatchScore { readonly trackId: string; readonly poseSimilarity: number; readonly appearanceSimilarity: number; readonly positionContinuity: number; readonly motionContinuity: number; readonly totalScore: number; }
export interface ActivePlayerSnapshot { readonly state: ActivePlayerState; readonly activeTrackId?: string; readonly tracks: readonly PersonTrack[]; readonly scores: readonly ActivePlayerMatchScore[]; readonly detectedPoseCount: number; readonly lostDurationMs: number; readonly idSwitchCount: number; readonly registrationProgress: number; readonly error?: string; }
export interface PersonReIdentificationAdapter { createEmbedding(source: CanvasImageSource, boundingBox: NormalizedBoundingBox): Promise<Float32Array | null>; similarity(first: Float32Array, second: Float32Array): number; }
