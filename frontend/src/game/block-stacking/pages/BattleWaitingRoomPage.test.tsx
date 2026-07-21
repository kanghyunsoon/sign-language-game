// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { GameModuleContext, type GameModuleContextValue } from "../../app/GameModuleContext";
import type { BattleRoomDetail, BattleRoomGateway } from "../battle/room";
import type { GameModuleServices } from "../../contracts";
import type { SharedGameCameraSession } from "../../media/camera/SharedGameCameraSession";
import { MockBattleMediaSession } from "../../media/mock/MockBattleMediaSession";
import { BattleWaitingRoomPage } from "./BattleWaitingRoomPage";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("BattleWaitingRoomPage", () => {
  it("refreshes participants from the server", async () => {
    const getRoom = vi.fn().mockResolvedValueOnce(room(false)).mockResolvedValue(room(true));
    renderPage({ roomGateway: gateway({ getRoom }) });
    expect(await screen.findByText("상대방을 기다리는 중")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    expect((await screen.findAllByText("상대사용자")).length).toBeGreaterThan(0);
  });

  it("shows the host role and disables start while only one participant exists", async () => {
    renderPage();
    expect(await screen.findByText("나사용자 (나)")).toBeTruthy();
    expect(screen.getAllByText("방장").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "게임 시작" })).toHaveProperty("disabled", true);
    expect(screen.getByText("상대방이 입장해야 시작할 수 있습니다.")).toBeTruthy();
  });

  it("does not show the start button to a non-host participant", async () => {
    renderPage({ currentUserId: "user-2", detail: room(true) });
    await screen.findByText("상대사용자 (나)");
    expect(screen.queryByRole("button", { name: "게임 시작" })).toBeNull();
  });

  it("moves a non-host participant into play when polling finds an active match", async () => {
    const active = { ...room(true), status: "PLAYING" as const, activeMatchId: "match-1", matchStartAt: Date.now() };
    renderPage({
      currentUserId: "user-2",
      detail: room(true),
      roomGateway: gateway({ getRoom: vi.fn(async () => active) }),
    });

    expect(await screen.findByText("PLAY_ROUTE")).toBeTruthy();
  });

  it("starts a full room through the server and navigates to battle play", async () => {
    const startGame = vi.fn(async () => undefined);
    renderPage({ detail: room(true), roomGateway: gateway({ getRoom: vi.fn(async () => room(true)), startGame }) });
    fireEvent.click(await screen.findByRole("button", { name: "게임 시작" }));
    await waitFor(() => expect(startGame).toHaveBeenCalledWith("room-1"));
    expect(await screen.findByText("PLAY_ROUTE")).toBeTruthy();
  });

  it("keeps the camera and Mesh session alive when navigating from waiting to play", async () => {
    const track = { kind: "video", readyState: "live", enabled: true } as MediaStreamTrack;
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const camera: SharedGameCameraSession = { start: vi.fn(async () => stream), getStream: () => stream, getVideoTrack: () => track, stop: vi.fn() };
    const media = new MockBattleMediaSession();
    const connect = vi.spyOn(media, "connect");
    const disconnect = vi.spyOn(media, "disconnect");
    renderPage({ detail: room(true), roomGateway: gateway({ getRoom: vi.fn(async () => room(true)) }), camera, media });
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "게임 시작" }));
    expect(await screen.findByText("PLAY_ROUTE")).toBeTruthy();
    expect(camera.start).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(camera.stop).not.toHaveBeenCalled();
  });

  it("shows a server start rejection without navigating", async () => {
    const startGame = vi.fn(async () => { throw new Error("Match already active"); });
    renderPage({ detail: room(true), roomGateway: gateway({ getRoom: vi.fn(async () => room(true)), startGame }) });
    fireEvent.click(await screen.findByRole("button", { name: "게임 시작" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Match already active");
    expect(screen.queryByText("PLAY_ROUTE")).toBeNull();
  });

  it("starts one shared camera stream and passes it to the persistent Mesh session", async () => {
    const order: string[] = [];
    const track = { kind: "video", readyState: "live", enabled: true } as MediaStreamTrack;
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
    const camera: SharedGameCameraSession = { start: vi.fn(async () => { order.push("camera"); return stream; }), getStream: () => stream, getVideoTrack: () => track, stop: vi.fn() };
    const media = new MockBattleMediaSession();
    const connect = vi.spyOn(media, "connect").mockImplementation(async (_room, received) => { order.push("mesh"); expect(received).toBe(stream); });
    renderPage({ camera, media });
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["camera", "mesh"]);
    expect(camera.start).toHaveBeenCalledTimes(1);
  });

  it("shows signaling, peer, game, camera, and AI connection states", async () => {
    renderPage();
    await screen.findByText("입문 대전방");
    expect(screen.getByText("AI 서버").parentElement?.textContent).toContain("게임 시작 전 대기");
    expect(screen.getByText("RTC Signaling")).toBeTruthy();
    expect(screen.getByText("상대 연결")).toBeTruthy();
    expect(screen.getByText("Game WebSocket")).toBeTruthy();
    expect(screen.getByText("카메라")).toBeTruthy();
  });

  it("leaves the room and releases media resources", async () => {
    const leaveRoom = vi.fn(async () => undefined);
    const camera = emptyCamera();
    const media = new MockBattleMediaSession();
    const disconnect = vi.spyOn(media, "disconnect");
    renderPage({ roomGateway: gateway({ getRoom: vi.fn(async () => room(false)), leaveRoom }), camera, media });
    fireEvent.click(await screen.findByRole("button", { name: "방 나가기" }));
    await waitFor(() => expect(leaveRoom).toHaveBeenCalledWith("room-1"));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("LIST_ROUTE")).toBeTruthy();
  });
});

interface RenderOptions {
  readonly detail?: BattleRoomDetail;
  readonly currentUserId?: string;
  readonly roomGateway?: BattleRoomGateway;
  readonly camera?: SharedGameCameraSession;
  readonly media?: MockBattleMediaSession;
}

function renderPage(options: RenderOptions = {}) {
  const currentUserId = options.currentUserId ?? "user-1";
  const detail = options.detail ?? room(false);
  const roomGateway = options.roomGateway ?? gateway({ getRoom: vi.fn(async () => detail) });
  const value: GameModuleContextValue = {
    user: { userId: currentUserId, displayName: currentUserId === "user-1" ? "나사용자" : "상대사용자" },
    config: { soloApiBaseUrl: "/solo", roomApiBaseUrl: "/rooms", gameWebSocketUrl: "ws://game", rtcConfigApiBaseUrl: "/rtc", aiWebSocketUrl: "ws://ai", battleRoomPollingIntervalMs: 60_000 },
    services: { battleRoomGateway: roomGateway } as unknown as GameModuleServices,
    battleMediaSession: options.media ?? new MockBattleMediaSession(), sharedCameraSession: options.camera ?? emptyCamera(),
    battleRoomSession: { ...detail, currentUser: { userId: currentUserId, displayName: currentUserId === "user-1" ? "나사용자" : "상대사용자" } }, setBattleRoomSession: vi.fn(),
  };
  return render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/battle/room-1"]}><Routes><Route path="/game/battle" element={<span>LIST_ROUTE</span>} /><Route path="/game/battle/:roomId" element={<BattleWaitingRoomPage />} /><Route path="/game/battle/:roomId/play" element={<span>PLAY_ROUTE</span>} /></Routes></MemoryRouter></GameModuleContext.Provider>);
}

function gateway(overrides: Partial<BattleRoomGateway> = {}): BattleRoomGateway {
  return { getRooms: vi.fn(async () => []), createRoom: vi.fn(), joinRoom: vi.fn(), getRoom: vi.fn(async () => room(false)), leaveRoom: vi.fn(async () => undefined), startGame: vi.fn(async () => undefined), returnToWaiting: vi.fn(async () => undefined), ...overrides };
}

function room(full: boolean): BattleRoomDetail {
  const participants = [{ userId: "user-1", displayName: "나사용자", isHost: true }, ...(full ? [{ userId: "user-2", displayName: "상대사용자", isHost: false }] : [])];
  return { roomId: "room-1", title: "입문 대전방", status: full ? "FULL" : "WAITING", playerCount: participants.length, maxPlayers: 2, hostUserId: "user-1", hostName: "나사용자", difficulty: "EASY", symbolRange: ["ㄱ", "ㄴ"], createdAt: null, canJoin: !full, participants, canStart: full, startBlockReason: full ? undefined : "상대방이 입장해야 시작할 수 있습니다.", rematch: false, activeMatchId: null, matchStartAt: null };
}

function emptyCamera(): SharedGameCameraSession {
  return { start: vi.fn(async () => { throw new Error("not configured"); }), getStream: () => null, getVideoTrack: () => null, stop: vi.fn() };
}
