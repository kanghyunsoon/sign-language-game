import {
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

import { createVisionFileset } from "./createVisionFileset";
import { DEFAULT_HAND_DETECTION_CONFIG, type HandDetectionConfig, type Handedness, type TrackedHand } from "./types";

export type { TrackedHand } from "./types";

// Match the worker input budget. A 480px fallback frame performs more than
// three times as much pixel work and used to freeze physics whenever worker
// initialization was unavailable.
const MAX_MAIN_THREAD_INFERENCE_EDGE = 256;

export class MediaPipeHandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private inferenceCanvas: HTMLCanvasElement | null = null;

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
    return this.toTrackedHands(
      this.handLandmarker.detectForVideo(this.createInferenceSource(video), timestamp),
    );
  }

  close(): void {
    this.handLandmarker?.close();
    this.handLandmarker = null;
    this.inferenceCanvas = null;
  }

  private createInferenceSource(video: HTMLVideoElement): HTMLVideoElement | HTMLCanvasElement {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (
      sourceWidth <= 0
      || sourceHeight <= 0
      || Math.max(sourceWidth, sourceHeight) <= MAX_MAIN_THREAD_INFERENCE_EDGE
      || typeof document === "undefined"
    ) {
      return video;
    }

    const scale = MAX_MAIN_THREAD_INFERENCE_EDGE / Math.max(sourceWidth, sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = this.inferenceCanvas ?? document.createElement("canvas");
    this.inferenceCanvas = canvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    canvas.getContext("2d", { alpha: false, desynchronized: true })?.drawImage(
      video,
      0,
      0,
      width,
      height,
    );
    return canvas;
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
