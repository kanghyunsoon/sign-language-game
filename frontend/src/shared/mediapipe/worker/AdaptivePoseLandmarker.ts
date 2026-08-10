import { MediaPipePoseTracker } from "../MediaPipePoseTracker";
import type { PoseDetection } from "../types";
import { canUseHandLandmarkerWorker } from "./HandLandmarkerWorkerClient";
import { PoseLandmarkerWorkerClient } from "./PoseLandmarkerWorkerClient";

/** Keeps active-player tracking alive when the pose worker or landmarker faults. */
export class AdaptivePoseLandmarker {
  private worker: PoseLandmarkerWorkerClient | null = null;
  private main: MediaPipePoseTracker | null = null;
  private mode: "WORKER" | "MAIN_THREAD" = "MAIN_THREAD";

  constructor(
    private readonly maximumTrackedPeople = 4,
    private readonly createWorker = () => new PoseLandmarkerWorkerClient(maximumTrackedPeople),
  ) {}

  async initialize(): Promise<void> {
    if (canUseHandLandmarkerWorker()) {
      const worker = this.createWorker();
      try {
        await worker.initialize();
        this.worker = worker;
        this.mode = "WORKER";
        return;
      } catch {
        worker.close();
      }
    }
    await this.initializeMain();
  }

  async detect(video: HTMLVideoElement, timestamp: number, frameId: number): Promise<readonly PoseDetection[]> {
    if (this.worker) {
      try {
        return await this.worker.detect(video, timestamp, frameId);
      } catch {
        this.worker.close();
        this.worker = null;
        try {
          await this.initializeMain();
          return this.main?.detect(video, timestamp) ?? [];
        } catch {
          return [];
        }
      }
    }

    if (!this.main) {
      try {
        await this.initializeMain();
      } catch {
        return [];
      }
    }
    try {
      return this.main?.detect(video, timestamp) ?? [];
    } catch {
      this.main?.close();
      this.main = null;
      return [];
    }
  }

  getMode(): "WORKER" | "MAIN_THREAD" {
    return this.mode;
  }

  close(): void {
    this.worker?.close();
    this.worker = null;
    this.main?.close();
    this.main = null;
  }

  private async initializeMain(): Promise<void> {
    if (this.main) return;
    const tracker = new MediaPipePoseTracker(this.maximumTrackedPeople);
    try {
      await tracker.initialize();
      this.main = tracker;
      this.mode = "MAIN_THREAD";
    } catch (cause) {
      tracker.close();
      throw cause;
    }
  }
}
