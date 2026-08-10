export interface HandLandmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type Handedness = "LEFT" | "RIGHT" | "UNKNOWN";

export interface HandLandmarkFrame {
  readonly frameId: number;
  readonly capturedAt: number;
  readonly handedness: Handedness;
  readonly landmarks: readonly HandLandmark[];
  /** Unsmoothed detector output reserved for motion analysis. */
  readonly rawLandmarks?: readonly HandLandmark[];
  /** Rotates whenever ownership switches to another active hand. */
  readonly activeHandSessionId?: string;
  readonly activeHandId?: string;
}

export type LandmarkFrame = HandLandmarkFrame;

export function isValidHandLandmarks(
  landmarks: readonly HandLandmark[],
): boolean {
  return (
    landmarks.length === 21 &&
    landmarks.every(
      ({ x, y, z }) =>
        Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z),
    )
  );
}
