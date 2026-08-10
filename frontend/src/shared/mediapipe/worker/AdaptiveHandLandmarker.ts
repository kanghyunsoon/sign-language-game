import { MediaPipeHandTracker, type TrackedHand } from "../MediaPipeHandTracker";
import { DEFAULT_HAND_DETECTION_CONFIG, type HandDetectionConfig } from "../types";
import { canUseHandLandmarkerWorker, HandLandmarkerWorkerClient } from "./HandLandmarkerWorkerClient";

/**
 * Prefers the worker, but a worker fault must never permanently stop camera
 * recognition. A failed frame is dropped while a main-thread tracker takes
 * over; if that tracker also faults it is recreated on a later frame.
 */
export class AdaptiveHandLandmarker {
  private worker: HandLandmarkerWorkerClient | null = null;
  private main: MediaPipeHandTracker | null = null;
  private mode: "WORKER" | "MAIN_THREAD" = "MAIN_THREAD";

  constructor(
    private readonly createWorker?: () => HandLandmarkerWorkerClient,
    private readonly config: HandDetectionConfig = DEFAULT_HAND_DETECTION_CONFIG,
    private readonly preferWorker = true,
  ) {}

  async initialize(): Promise<void> {
    // Re-initializing a live instance must not spawn a second worker — the
    // vision-adapter pool reuses instances across camera sessions.
    if (this.worker || this.main) {
      return;
    }
    if (this.preferWorker && canUseHandLandmarkerWorker()) {
      const worker = this.createWorker?.() ?? new HandLandmarkerWorkerClient(undefined, this.config);
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

  async detect(video: HTMLVideoElement, timestamp: number, frameId: number): Promise<readonly TrackedHand[]> {
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
          // The next scheduled frame retries initialization. Do not tear down
          // the entire camera session because one MediaPipe worker failed.
        }
        return [];
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
    const tracker = new MediaPipeHandTracker(this.config);
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
