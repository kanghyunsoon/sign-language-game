import { describe, expect, it, vi } from "vitest";

import { BrowserRecognitionFrameScheduler } from "./RecognitionFrameScheduler";

describe("BrowserRecognitionFrameScheduler", () => {
  it("limits render, hand and pose independently and cleans the frame", () => {
    let callback: FrameRequestCallback = () => undefined;
    let at = 0;
    const cancel = vi.fn();
    const video = { readyState: 4, currentTime: 0 } as HTMLVideoElement;
    const scheduler = new BrowserRecognitionFrameScheduler({
      video,
      config: { renderFps: 60, handTrackingFps: 20, poseTrackingFps: 10, aiInferenceFps: 12 },
      now: () => at,
      requestFrame: (next) => { callback = next; return 7; },
      cancelFrame: cancel,
    });
    const render = vi.fn();
    const hand = vi.fn();
    const pose = vi.fn();
    scheduler.subscribeRenderFrame(render);
    scheduler.subscribeHandFrame(hand);
    scheduler.subscribePoseFrame(pose);
    scheduler.start();
    for (at = 0; at <= 200; at += 10) {
      video.currentTime = at / 1_000;
      callback(at);
    }
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(10);
    expect(hand).toHaveBeenCalledTimes(5);
    expect(pose).toHaveBeenCalledTimes(3);
    scheduler.pause();
    at = 300;
    video.currentTime = .3;
    callback(at);
    expect(pose).toHaveBeenCalledTimes(3);
    scheduler.resume();
    at = 310;
    video.currentTime = .31;
    callback(at);
    expect(pose).toHaveBeenCalledTimes(4);
    scheduler.dispose();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("does not run MediaPipe consumers repeatedly for the same camera frame", () => {
    let callback: FrameRequestCallback = () => undefined;
    let at = 0;
    const video = { readyState: 4, currentTime: 1 } as HTMLVideoElement;
    const scheduler = new BrowserRecognitionFrameScheduler({
      video,
      now: () => at,
      requestFrame: (next) => { callback = next; return 1; },
    });
    const hand = vi.fn();
    scheduler.subscribeHandFrame(hand);
    scheduler.start();
    for (at = 0; at <= 100; at += 10) callback(at);
    expect(hand).toHaveBeenCalledTimes(1);
    video.currentTime = 1.05;
    at = 110;
    callback(at);
    expect(hand).toHaveBeenCalledTimes(2);
  });
});
