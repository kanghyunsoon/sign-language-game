import type { HandLandmark } from "../../../game/recognition";

export interface WordDetectedHand {
  readonly handedness: "LEFT" | "RIGHT";
  readonly score?: number;
  readonly landmarks: readonly HandLandmark[];
}

export interface WordLandmarkFrame {
  readonly frameId: number;
  readonly capturedAt: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly hands: {
    readonly left: WordDetectedHand | null;
    readonly right: WordDetectedHand | null;
  };
  readonly activeHandSessionId?: string;
}
