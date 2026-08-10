import { describe, expect, it, vi } from "vitest";

import { createRemoteRecognitionVisionAdapterFactory } from "./RemoteRecognitionVisionAdapter";
import type { RecognitionVisionAdapterOptions, RecognitionVisionFrame } from "./RecognitionVisionAdapter";

const options: RecognitionVisionAdapterOptions = {
  handDetectionConfig: {
    maximumDetectedHands: 2,
    minimumHandDetectionConfidence: .5,
    minimumHandPresenceConfidence: .5,
    minimumTrackingConfidence: .5,
  },
  maximumTrackedPeople: 4,
  enablePoseTracking: false,
  preferWorker: true,
};

describe("RemoteRecognitionVisionAdapter", () => {
  it("keeps remote transport behind the shared vision contract", async () => {
    const transport = {
      connect: vi.fn().mockResolvedValue(undefined),
      detectHands: vi.fn().mockResolvedValue([]),
      detectPoses: vi.fn().mockResolvedValue([]),
      disconnect: vi.fn(),
    };
    const adapter = createRemoteRecognitionVisionAdapterFactory(() => transport).create(options);
    const frame = { video: {} as HTMLVideoElement, timestamp: 12, frameId: 3 } satisfies RecognitionVisionFrame;

    await adapter.initialize();
    await adapter.detectHands(frame);
    expect(await adapter.detectPoses(frame)).toEqual([]);
    adapter.close();

    expect(transport.connect).toHaveBeenCalledWith(options);
    expect(transport.detectHands).toHaveBeenCalledWith(frame);
    expect(transport.detectPoses).not.toHaveBeenCalled();
    expect(transport.disconnect).toHaveBeenCalledOnce();
    expect(adapter.getExecutionMode()).toBe("REMOTE");
  });
});
