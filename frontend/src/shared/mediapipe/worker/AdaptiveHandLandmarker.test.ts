import { afterEach, describe, expect, it, vi } from "vitest";

const tracker = vi.hoisted(() => ({
  initialize: vi.fn(async () => undefined),
  detect: vi.fn(() => []),
  close: vi.fn(),
}));

vi.mock("../MediaPipeHandTracker", () => ({
  MediaPipeHandTracker: class {
    initialize = tracker.initialize;
    detect = tracker.detect;
    close = tracker.close;
  },
}));

import { AdaptiveHandLandmarker } from "./AdaptiveHandLandmarker";
import type { HandLandmarkerWorkerClient } from "./HandLandmarkerWorkerClient";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AdaptiveHandLandmarker", () => {
  it("falls back to the main thread when Worker initialization fails", async () => {
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("createImageBitmap", vi.fn());
    const worker = {
      initialize: vi.fn(async () => { throw new Error("worker unavailable"); }),
      close: vi.fn(),
    } as unknown as HandLandmarkerWorkerClient;
    const landmarker = new AdaptiveHandLandmarker(() => worker);
    await landmarker.initialize();
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(tracker.initialize).toHaveBeenCalledTimes(1);
    expect(landmarker.getMode()).toBe("MAIN_THREAD");
    landmarker.close();
    expect(tracker.close).toHaveBeenCalledTimes(1);
  });

  it("falls back without stopping recognition after a Worker detection failure", async () => {
    vi.stubGlobal("Worker", class {});
    vi.stubGlobal("createImageBitmap", vi.fn());
    const worker = {
      initialize: vi.fn(async () => undefined),
      detect: vi.fn(async () => { throw new Error("worker crashed"); }),
      close: vi.fn(),
    } as unknown as HandLandmarkerWorkerClient;
    const landmarker = new AdaptiveHandLandmarker(() => worker);
    await landmarker.initialize();
    expect(landmarker.getMode()).toBe("WORKER");
    await expect(landmarker.detect({} as HTMLVideoElement, 10, 1)).resolves.toEqual([]);
    expect(worker.close).toHaveBeenCalledTimes(1);
    expect(tracker.detect).toHaveBeenCalledTimes(1);
    expect(landmarker.getMode()).toBe("MAIN_THREAD");
  });
});
