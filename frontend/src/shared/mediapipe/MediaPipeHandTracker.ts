import {
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

import { createVisionFileset } from "./createVisionFileset";
import { DEFAULT_HAND_DETECTION_CONFIG, type HandDetectionConfig, type Handedness, type TrackedHand } from "./types";

export type { TrackedHand } from "./types";

export class MediaPipeHandTracker {
  private handLandmarker: HandLandmarker | null = null;

  constructor(private readonly config: HandDetectionConfig = DEFAULT_HAND_DETECTION_CONFIG) {}

  async initialize(): Promise<void> {
    if (this.handLandmarker) {
      return;
    }
    const vision = await createVisionFileset();
    try {
      this.handLandmarker = await this.createLandmarker(vision, "GPU");
    } catch {
      this.handLandmarker = await this.createLandmarker(vision, "CPU");
    }
  }

  detect(video: HTMLVideoElement, timestamp: number): readonly TrackedHand[] {
    if (!this.handLandmarker) {
      return [];
    }
    return this.toTrackedHands(this.handLandmarker.detectForVideo(video, timestamp));
  }

  close(): void {
    this.handLandmarker?.close();
    this.handLandmarker = null;
  }

  private createLandmarker(vision: Awaited<ReturnType<typeof createVisionFileset>>, delegate: "GPU" | "CPU"): Promise<HandLandmarker> {
    return HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/mediapipe/hand_landmarker.task",
        delegate,
      },
      runningMode: "VIDEO",
      numHands: this.config.maximumDetectedHands,
      minHandDetectionConfidence: this.config.minimumHandDetectionConfidence,
      minHandPresenceConfidence: this.config.minimumHandPresenceConfidence,
      minTrackingConfidence: this.config.minimumTrackingConfidence,
    });
  }

  private toTrackedHands(result: HandLandmarkerResult): readonly TrackedHand[] {
    return result.landmarks.map((landmarks, index) => ({
      handedness: this.toHandedness(
        result.handedness[index]?.[0]?.categoryName,
      ),
      handednessScore: result.handedness[index]?.[0]?.score ?? 0,
      landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
    }));
  }

  private toHandedness(value: string | undefined): Handedness {
    const normalized = value?.toUpperCase();
    return normalized === "LEFT" || normalized === "RIGHT"
      ? normalized
      : "UNKNOWN";
  }
}
