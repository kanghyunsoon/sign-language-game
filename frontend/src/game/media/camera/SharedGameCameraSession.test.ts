import { describe, expect, it, vi } from "vitest";

import { DEFAULT_GAME_CAMERA_CONSTRAINTS, DefaultSharedGameCameraSession } from "./SharedGameCameraSession";

describe("DefaultSharedGameCameraSession", () => {
  it("uses the mesh performance budget by default", () => {
    expect(DEFAULT_GAME_CAMERA_CONSTRAINTS.audio).toBe(false);
    expect(DEFAULT_GAME_CAMERA_CONSTRAINTS.video).toMatchObject({
      width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 15, max: 20 },
    });
  });
  it("opens the camera once and returns the same stream to every consumer", async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn(async () => stream);
    const session = new DefaultSharedGameCameraSession({ getUserMedia });

    const first = session.start();
    const second = session.start();

    expect(first).toBe(second);
    await expect(first).resolves.toBe(stream);
    await expect(session.start()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(session.getStream()).toBe(stream);
    expect(session.getVideoTrack()).toBe(stream.getVideoTracks()[0]);
  });

  it("stops every owned track and clears references", async () => {
    const { stream, videoTrack, audioTrack } = fakeStream(true);
    const session = new DefaultSharedGameCameraSession({ getUserMedia: async () => stream });
    await session.start();

    session.stop();

    expect(videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(audioTrack?.stop).toHaveBeenCalledTimes(1);
    expect(session.getStream()).toBeNull();
    expect(session.getVideoTrack()).toBeNull();
  });

  it("stops a late stream when start is cancelled", async () => {
    const { stream, videoTrack } = fakeStream();
    let resolveStream: ((value: MediaStream) => void) | undefined;
    const session = new DefaultSharedGameCameraSession({
      getUserMedia: () => new Promise((resolve) => { resolveStream = resolve; }),
    });
    const starting = session.start();

    session.stop();
    resolveStream?.(stream);

    await expect(starting).rejects.toThrow("cancelled");
    expect(videoTrack.stop).toHaveBeenCalledTimes(1);
    expect(session.getStream()).toBeNull();
  });
});

function fakeStream(withAudio = false) {
  const videoTrack = {
    kind: "video",
    readyState: "live",
    enabled: true,
    stop: vi.fn(),
  } as unknown as MediaStreamTrack;
  const audioTrack = withAudio ? ({ kind: "audio", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack) : null;
  const tracks = audioTrack ? [videoTrack, audioTrack] : [videoTrack];
  const stream = {
    getTracks: () => tracks,
    getVideoTracks: () => [videoTrack],
  } as unknown as MediaStream;
  return { stream, videoTrack, audioTrack };
}
