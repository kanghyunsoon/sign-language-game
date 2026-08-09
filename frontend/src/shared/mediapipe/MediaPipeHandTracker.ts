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
    this.warmUp();
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

  /**
   * GPU 딜리게이트의 첫 추론들은 셰이더 컴파일 때문에 프레임당 수백 ms씩
   * 걸리고, 메인 스레드에서는 그 시간 동안 렌더링이 통째로 멈춘다. 초기화
   * 단계("카메라 준비 중")에서 빈 프레임으로 미리 컴파일해 라이브 영상에서
   * 렉이 보이지 않게 한다. 빈 프레임에는 손이 없어 손 랜드마크 서브그래프는
   * 첫 실제 손에서 마저 데워지지만, 매 프레임 도는 손바닥 검출 경로가 가장
   * 크다. 이후 detect()의 타임스탬프는 같은 performance.now() 시계에서 더
   * 늦게 찍히므로 단조 증가가 깨지지 않는다. 워밍업 실패는 무시한다.
   */
  private warmUp(): void {
    const landmarker = this.handLandmarker;
    if (!landmarker || typeof document === "undefined") {
      return;
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = MAX_MAIN_THREAD_INFERENCE_EDGE;
      canvas.height = MAX_MAIN_THREAD_INFERENCE_EDGE;
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }
      context.fillStyle = "#222";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const base = performance.now();
      for (let i = 0; i < 3; i += 1) {
        landmarker.detectForVideo(canvas, base + i);
      }
    } catch {
      // 워밍업은 최적화일 뿐, 실패해도 초기화를 막지 않는다.
    }
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
