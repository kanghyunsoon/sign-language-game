import { afterEach, describe, expect, it, vi } from "vitest";
import { HandLandmarkerWorkerClient, type WorkerLike } from "./HandLandmarkerWorkerClient";

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  emit(data: unknown): void { this.onmessage?.({ data } as MessageEvent); }
}

afterEach(() => vi.unstubAllGlobals());

describe("HandLandmarkerWorkerClient", () => {
  it("starts a module worker, transfers only the frame, and cleans pending work", async () => {
    const worker = new FakeWorker();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    const client = new HandLandmarkerWorkerClient(() => worker);
    const ready = client.initialize();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "INITIALIZE", config: expect.objectContaining({ maximumDetectedHands: 4 }) });
    worker.emit({ type: "READY" });
    await ready;

    const resultPromise = client.detect({} as HTMLVideoElement, 100, 7);
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenLastCalledWith(
        { type: "DETECT", frameId: 7, timestamp: 100, bitmap },
        [bitmap],
      ));
    worker.emit({ type: "RESULT", frameId: 7, hands: [] });
    await expect(resultPromise).resolves.toEqual([]);
    client.close();
    expect(worker.postMessage).toHaveBeenLastCalledWith({ type: "CLOSE" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
