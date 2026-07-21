// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PythonWebSocketSignRecognizer } from "../../recognition";
import { LocalLineRaceRuntime } from "../core";
import { LineRaceBotPracticeDevRuntimePage, LineRaceBotPracticePage } from "./LineRaceBotPracticePage";

const camera = vi.hoisted(() => ({ stream: { getVideoTracks: () => [], getTracks: () => [] } as unknown as MediaStream, start: vi.fn(), getStream: vi.fn(), getVideoTrack: vi.fn(), stop: vi.fn() }));
const activePlayer = vi.hoisted(() => {
  let state = "LOCKED"; const listeners = new Set<(snapshot: any) => void>();
  const snapshot = () => ({ state, tracks: [], scores: [], detectedPoseCount: state === "LOCKED" ? 1 : 0, lostDurationMs: 0, idSwitchCount: 0, registrationProgress: state === "LOCKED" ? 1 : 0 });
  return { getSnapshot: snapshot, getConfig: () => ({}), subscribe: (listener: (value: any) => void) => { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); }, beginRegistration: vi.fn(), cancelRegistration: vi.fn(), resetRegistration: vi.fn(), clearRegistration: vi.fn(), process: vi.fn(), dispose: vi.fn(), setState: (next: string) => { state = next; listeners.forEach((listener) => listener(snapshot())); } };
});
vi.mock("../../app/GameModuleContext", () => ({ useGameModuleContext: () => ({ sharedCameraSession: camera, activePlayerSession: activePlayer, config: { aiWebSocketUrl: "ws://ai.test" } }) }));
vi.mock("./LineRaceGameShell", async () => {
  const React = await import("react");
  return { LineRaceGameShell: ({ runtime, clock }: { runtime: { update(now: number): void }; clock: { now(): number } }) => {
    React.useEffect(() => { const timer = window.setInterval(() => runtime.update(clock.now()), 16); return () => window.clearInterval(timer); }, [clock, runtime]);
    return <div data-testid="practice-race-shell" />;
  } };
});
vi.mock("../components", async () => {
  const actual = await vi.importActual<typeof import("../components")>("../components");
  return { ...actual, LineRaceCameraPanel: ({ cameraError }: { cameraError: string | null }) => <div>{cameraError ?? "mock camera"}</div> };
});

beforeEach(() => {
  vi.useFakeTimers(); activePlayer.setState("LOCKED"); camera.start.mockReset().mockResolvedValue(camera.stream); camera.stop.mockReset();
  vi.spyOn(PythonWebSocketSignRecognizer.prototype, "connect").mockResolvedValue();
  vi.spyOn(PythonWebSocketSignRecognizer.prototype, "disconnect").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("LineRaceBotPracticePage", () => {
  it("does not render the Mock UI when the explicit development flag is off", () => {
    render(<MemoryRouter><LineRaceBotPracticePage /></MemoryRouter>);
    expect(screen.queryByTestId("line-race-bot-practice")).toBeNull();
  });
  it("keeps the match idle until active-player registration is locked", () => {
    activePlayer.setState("REGISTERING"); render(<MemoryRouter><LineRaceBotPracticeDevRuntimePage /></MemoryRouter>);
    expect(screen.getByText("사용자 등록 대기 중")).toBeTruthy();
    act(() => vi.advanceTimersByTime(4_000)); expect(screen.getByText("IDLE")).toBeTruthy();
    act(() => activePlayer.setState("LOCKED")); expect(screen.queryByText("사용자 등록 대기 중")).toBeNull();
    act(() => vi.advanceTimersByTime(1)); expect(screen.getByText("COUNTDOWN")).toBeTruthy();
  });
  it("runs a local bot match, exposes controls/results, retries cleanly, and creates no WebRTC peer", async () => {
    const dispose = vi.spyOn(LocalLineRaceRuntime.prototype, "dispose");
    const peer = vi.fn(); Object.defineProperty(globalThis, "RTCPeerConnection", { configurable: true, value: peer });
    const view = render(<MemoryRouter><LineRaceBotPracticeDevRuntimePage /></MemoryRouter>);
    expect(screen.getByTestId("line-race-bot-practice")).toBeTruthy();
    expect(screen.getByText("카메라 없음")).toBeTruthy(); expect(screen.getAllByText(/Seed: 12345|Seed 12345/).length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(3_100));
    fireEvent.click(screen.getByRole("button", { name: "카운터 성공률 0%" })); expect(screen.getByText("카운터 확률: 0%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "경기 강제 종료" })); act(() => vi.advanceTimersByTime(120));
    expect(screen.getByRole("dialog", { name: "연습전 결과" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /재도전/ })); act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("dialog", { name: "연습전 결과" })).toBeNull();
    expect(peer).not.toHaveBeenCalled();
    view.unmount(); Reflect.deleteProperty(globalThis, "RTCPeerConnection");
    await Promise.resolve();expect(camera.stop).toHaveBeenCalled(); expect(dispose).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
