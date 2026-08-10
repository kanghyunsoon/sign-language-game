// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HandCamera } from "./HandCamera";

const tracker = vi.hoisted(() => ({
  initialize: vi.fn(async () => undefined),
  close: vi.fn(),
  detect: vi.fn(() => []),
}));

vi.mock("../../../shared/mediapipe/MediaPipeHandTracker", () => ({
  MediaPipeHandTracker: class {
    initialize = tracker.initialize;
    close = tracker.close;
    detect = tracker.detect;
  },
}));

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 77));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  tracker.initialize.mockClear();
  tracker.close.mockClear();
  tracker.detect.mockClear();
});

describe("HandCamera shared stream", () => {
  it("recovers its MediaPipe loop after the StrictMode lifecycle probe", async () => {
    const track = { kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
    const view = render(<StrictMode><HandCamera sharedStream={stream} autoStart /></StrictMode>);

    const video = view.container.querySelector("video")!;
    await waitFor(() => expect(video.srcObject).toBe(stream));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("uses the supplied stream, closes the MediaPipe loop, and leaves the shared track alive", async () => {
    const track = { kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const view = render(<HandCamera sharedStream={stream} autoStart />);

    await waitFor(() => expect(tracker.initialize).toHaveBeenCalledTimes(1));
    const video = view.container.querySelector("video")!;
    await waitFor(() => expect(video.srcObject).toBe(stream));
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();

    view.unmount();

    expect(tracker.close).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(77);
    expect(track.stop).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });
});
