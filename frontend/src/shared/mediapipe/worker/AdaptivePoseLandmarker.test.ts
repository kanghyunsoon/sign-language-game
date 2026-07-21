import { afterEach, describe, expect, it, vi } from "vitest";

const tracker = vi.hoisted(() => ({
  initialize: vi.fn(async () => undefined),
  detect: vi.fn(() => []),
  close: vi.fn(),
}));

vi.mock("../MediaPipePoseTracker", () => ({
  MediaPipePoseTracker: class {
    initialize = tracker.initialize;
    detect = tracker.detect;
    close = tracker.close;
  },
}));

import { AdaptivePoseLandmarker } from "./AdaptivePoseLandmarker";
import type { PoseLandmarkerWorkerClient } from "./PoseLandmarkerWorkerClient";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AdaptivePoseLandmarker", () => {
  it("falls back without stopping active-player tracking after a worker fault", async () => {
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("createImageBitmap", vi.fn());
    const worker = {
      initialize: vi.fn(async () => undefined),
      detect: vi.fn(async () => { throw new Error("worker crashed"); }),
      close: vi.fn(),
    } as unknown as PoseLandmarkerWorkerClient;
    const landmarker = new AdaptivePoseLandmarker(4, () => worker);

    await landmarker.initialize();
    await expect(landmarker.detect({} as HTMLVideoElement, 10, 1)).resolves.toEqual([]);

    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(tracker.detect).toHaveBeenCalledTimes(1);
    expect(landmarker.getMode()).toBe("MAIN_THREAD");
    landmarker.close();
  });
});
