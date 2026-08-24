// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HandCamera } from "./HandCamera";
import type { RecognitionVisionAdapter, RecognitionVisionAdapterFactory } from "../vision";

/**
 * HandCamera는 MediaPipe를 직접 쓰지 않고 비전 어댑터 포트를 거친다
 * (`visionAdapterFactory` 프로퍼티, 기본값은 컨텍스트의 MediaPipe 어댑터).
 * 예전 이 테스트는 `MediaPipeHandTracker` 모듈을 목으로 잡았는데 컴포넌트가 그
 * 모듈을 부르지 않아 목이 한 번도 실행되지 않았다. 포트를 직접 주입한다.
 */
const adapter = {
  initialize: vi.fn(async () => undefined),
  detectHands: vi.fn(async () => []),
  detectPoses: vi.fn(async () => []),
  getExecutionMode: vi.fn(() => "MAIN_THREAD" as const),
  close: vi.fn(),
} satisfies RecognitionVisionAdapter;

const visionAdapterFactory: RecognitionVisionAdapterFactory = { create: () => adapter };

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
  adapter.initialize.mockClear();
  adapter.detectHands.mockClear();
  adapter.detectPoses.mockClear();
  adapter.close.mockClear();
});

const sharedVideoStream = () => {
  const track = { kind: "video", readyState: "live", stop: vi.fn() } as unknown as MediaStreamTrack;
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
};

describe("HandCamera shared stream", () => {
  it("recovers its vision loop after the StrictMode lifecycle probe", async () => {
    const { track, stream } = sharedVideoStream();
    const view = render(
      <StrictMode><HandCamera sharedStream={stream} autoStart visionAdapterFactory={visionAdapterFactory} /></StrictMode>,
    );

    const video = view.container.querySelector("video")!;
    await waitFor(() => expect(video.srcObject).toBe(stream));
    await waitFor(() => expect(adapter.initialize).toHaveBeenCalled());
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("uses the supplied stream, closes the vision adapter, and leaves the shared track alive", async () => {
    const { track, stream } = sharedVideoStream();
    const view = render(<HandCamera sharedStream={stream} autoStart visionAdapterFactory={visionAdapterFactory} />);

    await waitFor(() => expect(adapter.initialize).toHaveBeenCalledTimes(1));
    const video = view.container.querySelector("video")!;
    await waitFor(() => expect(video.srcObject).toBe(stream));
    // 공유 스트림을 받았으면 카메라를 새로 열지 않는다.
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();

    view.unmount();

    expect(adapter.close).toHaveBeenCalled();
    // 프레임 스케줄러(rAF 루프)도 함께 정리돼야 한다.
    expect(cancelAnimationFrame).toHaveBeenCalledWith(77);
    // 스트림 소유자는 호출자다. 언마운트가 다른 소비자의 트랙을 끊으면 안 된다.
    expect(track.stop).not.toHaveBeenCalled();
    expect(video.srcObject).toBeNull();
  });
});
