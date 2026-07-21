// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PythonWebSocketSignRecognizer } from "../../recognition";
import { LocalLineRaceRuntime } from "../core";
import { LineRaceDevHarnessRuntimePage } from "./LineRaceDevHarnessPage";

const camera = vi.hoisted(() => ({
  stream: { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream,
  start: vi.fn(), getStream: vi.fn(), getVideoTrack: vi.fn(), stop: vi.fn(),
}));

vi.mock("../../app/GameModuleContext", () => ({
  useGameModuleContext: () => ({
    sharedCameraSession: camera,
    config: { aiWebSocketUrl: "ws://ai.test" },
  }),
}));

vi.mock("../pages/LineRaceGameShell", () => ({
  LineRaceGameShell: () => <div data-testid="mock-line-race-shell" />,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  camera.start.mockReset(); camera.stop.mockReset();
  camera.getStream.mockReset(); camera.getVideoTrack.mockReset();
});

describe("LineRaceDevHarnessPage", () => {
  it("provides local controls and disposes runtime/timer on unmount", async () => {
    vi.useFakeTimers();
    camera.start.mockResolvedValue(camera.stream);
    vi.spyOn(PythonWebSocketSignRecognizer.prototype, "connect").mockResolvedValue();
    vi.spyOn(PythonWebSocketSignRecognizer.prototype, "disconnect").mockImplementation(() => undefined);
    const dispose = vi.spyOn(LocalLineRaceRuntime.prototype, "dispose");
    const view = render(<MemoryRouter><LineRaceDevHarnessRuntimePage /></MemoryRouter>);
    expect(screen.getByTestId("line-race-dev-harness")).toBeTruthy();
    expect(screen.getByText("PLAYER_A: 0.0 / 1050")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "경기 시작" }));
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getAllByText("COUNTDOWN")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "장애물 3개 연속 생성" }));
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getAllByText(/ㄱ · PLAYER_A · \d+ · WARNING/)).toHaveLength(3);
    fireEvent.keyDown(window, { key: "1" });
    expect(screen.getByText("경기 중에만 입력할 수 있습니다.")).toBeTruthy();
    view.unmount();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(camera.start).toHaveBeenCalledTimes(1);
    await Promise.resolve();expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the runtime UI available when shared camera permission is denied", async () => {
    camera.start.mockRejectedValue(new DOMException("Camera permission denied", "NotAllowedError"));
    vi.spyOn(PythonWebSocketSignRecognizer.prototype, "connect").mockResolvedValue();
    vi.spyOn(PythonWebSocketSignRecognizer.prototype, "disconnect").mockImplementation(() => undefined);
    const view = render(<MemoryRouter><LineRaceDevHarnessRuntimePage /></MemoryRouter>);
    expect((await screen.findByRole("alert")).textContent).toContain("카메라 권한이 거절되었습니다");
    expect(screen.getByRole("button", { name: "경기 시작" })).toBeTruthy();
    view.unmount();
    await waitFor(()=>expect(camera.stop).toHaveBeenCalledTimes(1));
  });
});
