import type { HandLandmark } from "../../../game/recognition";

export interface WordDetectedHand {
  readonly handedness: "LEFT" | "RIGHT";
  readonly score?: number;
  readonly landmarks: readonly HandLandmark[];
}

export interface WordPoseLandmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility?: number;
  readonly presence?: number;
}

/** 서버가 손 위치 정규화 기준으로 쓰는 9개 상체 포인트. */
export interface WordPoseKeypoints {
  readonly nose: WordPoseLandmark;
  readonly leftEar: WordPoseLandmark;
  readonly rightEar: WordPoseLandmark;
  readonly leftShoulder: WordPoseLandmark;
  readonly rightShoulder: WordPoseLandmark;
  readonly leftElbow: WordPoseLandmark;
  readonly rightElbow: WordPoseLandmark;
  readonly leftWrist: WordPoseLandmark;
  readonly rightWrist: WordPoseLandmark;
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
  /** 미검출 시 null. 어깨 2점이 손 위치 정규화의 기준이라 없으면 서버가 판정을 보류한다. */
  readonly pose: WordPoseKeypoints | null;
  readonly activeHandSessionId?: string;
}
