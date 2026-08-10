// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameVideoTile } from "./GameVideoTile";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GameVideoTile", () => {
  it("attaches and detaches the local stream without stopping it", () => {
    const stream = {} as MediaStream;
    const view = render(
      <GameVideoTile kind="LOCAL" label="내 영상" stream={stream} cameraEnabled connectionState="CONNECTED" />,
    );
    const video = view.container.querySelector("video")!;

    expect(video.srcObject).toBe(stream);
    expect(video.muted).toBe(true);
    view.unmount();
    expect(video.srcObject).toBeNull();
  });

  it("shows remote video state and never renders a local AI overlay", () => {
    render(
      <GameVideoTile
        kind="REMOTE"
        label="상대 영상"
        stream={null}
        cameraEnabled={false}
        connectionState="RECONNECTING"
        overlay={<span>LOCAL AI OVERLAY</span>}
      />,
    );
    expect(screen.getByText("재연결 중")).toBeTruthy();
    expect(screen.queryByText("LOCAL AI OVERLAY")).toBeNull();
  });

  it("renders an overlay only on the local tile", () => {
    render(
      <GameVideoTile
        kind="LOCAL"
        label="내 영상"
        stream={{} as MediaStream}
        cameraEnabled
        connectionState="CONNECTED"
        overlay={<span>목표 ㄱ</span>}
      />,
    );
    expect(screen.getByText("목표 ㄱ")).toBeTruthy();
  });
});
