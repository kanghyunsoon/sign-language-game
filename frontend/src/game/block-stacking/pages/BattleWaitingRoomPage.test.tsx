// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { GameModuleContext, type GameModuleContextValue } from "../../app/GameModuleContext";
import type { BattleRoomDetail, BattleRoomGateway, BattleRoomSession, BattleRoomSummary } from "../battle/room";
import type { GameModuleServices } from "../../contracts";
import type { SharedGameCameraSession } from "../../media/camera/SharedGameCameraSession";
import { MockBattleMediaSession } from "../../media/mock/MockBattleMediaSession";
import type { RoomRealtimeSocket, RoomServerMessage } from "../../realtime";
import { BattleWaitingRoomPage } from "./BattleWaitingRoomPage";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("BattleWaitingRoomPage backend flow", () => {
  it("opens the room WebSocket while waiting", async () => {
    const socket = new FakeRoomSocket();
    renderPage({ socket });
    await waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Room WebSocket")).toBeTruthy();
  });

  it("reflects a lobby participant update without reload", async () => {
    const subscribeRooms = vi.fn((listener: (rooms: readonly BattleRoomSummary[]) => void) => {
      queueMicrotask(() => listener([{
        roomId: "1", roomCode: "ABC123", title: "room", status: "FULL", playerCount: 2,
        maxPlayers: 2, hostUserId: "1", hostName: "host", difficulty: "basic",
        symbolRange: [], createdAt: null, canJoin: false,
      }]));
      return () => undefined;
    });
    renderPage({ gateway: gateway({ subscribeRooms }) });

    expect((await screen.findAllByText("2/2")).length).toBeGreaterThan(0);
    expect(subscribeRooms).toHaveBeenCalledTimes(1);
  });  it("updates only its own ready state through REST", async () => {
    const setReady = vi.fn(async () => session({ hostReady: true, currentUserReady: true }));
    renderPage({ gateway: gateway({ setReady }) });
    fireEvent.click(await screen.findByRole("button", { name: "준비 완료" }));
    await waitFor(() => expect(setReady).toHaveBeenCalledWith("1", true));
    expect(await screen.findByRole("button", { name: "준비 취소" })).toBeTruthy();
  });

  it("starts WebRTC after a successful host start request", async () => {
    const order: string[] = [];
    const { camera, stream } = cameraFixture(() => order.push("camera"));
    const media = new MockBattleMediaSession();
    vi.spyOn(media, "connect").mockImplementation(async (_room, received) => {
      expect(received).toBe(stream);
      order.push("rtc");
    });
    const startGame = vi.fn(async () => undefined);
    renderPage({
      detail: room({ full: true, hostReady: true, guestReady: true, currentUserReady: true }),
      gateway: gateway({ startGame }),
      camera,
      media,
    });
    fireEvent.click(await screen.findByRole("button", { name: "게임 시작" }));
    await waitFor(() => expect(startGame).toHaveBeenCalledWith("1"));
    expect(await screen.findByText("PLAY_ROUTE")).toBeTruthy();
    expect(order.at(-1)).toBe("rtc");
    expect(camera.start).toHaveBeenCalled();
  });

  it("lets a guest enter when GAME_STARTED arrives", async () => {
    const socket = new FakeRoomSocket();
    const { camera } = cameraFixture();
    const media = new MockBattleMediaSession();
    const connect = vi.spyOn(media, "connect");
    renderPage({
      currentUserId: "2",
      detail: room({ full: true, hostReady: true, guestReady: true, currentUserReady: true }),
      socket,
      camera,
      media,
    });
    socket.emit({ type: "GAME_STARTED", payload: { roomId: 1 } });
    expect(await screen.findByText("PLAY_ROUTE")).toBeTruthy();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("leaves through REST and releases media resources", async () => {
    const leaveRoom = vi.fn(async () => undefined);
    const camera = emptyCamera();
    const media = new MockBattleMediaSession();
    const disconnect = vi.spyOn(media, "disconnect");
    renderPage({ gateway: gateway({ leaveRoom }), camera, media });
    fireEvent.click(await screen.findByRole("button", { name: "방 나가기" }));
    await waitFor(() => expect(leaveRoom).toHaveBeenCalledWith("1"));
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(camera.stop).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("LIST_ROUTE")).toBeTruthy();
  });
});

class FakeRoomSocket {
  readonly connect = vi.fn(async () => undefined);
  readonly disconnect = vi.fn();
  private readonly listeners = new Set<(message: RoomServerMessage) => void>();
  subscribe(listener: (message: RoomServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  subscribeError(): () => void { return () => undefined; }
  emit(message: RoomServerMessage): void {
    for (const listener of this.listeners) listener(message);
  }
}

interface RenderOptions {
  readonly detail?: BattleRoomDetail;
  readonly currentUserId?: string;
  readonly gateway?: BattleRoomGateway;
  readonly camera?: SharedGameCameraSession;
  readonly media?: MockBattleMediaSession;
  readonly socket?: FakeRoomSocket;
}

function renderPage(options: RenderOptions = {}) {
  const currentUserId = options.currentUserId ?? "1";
  const detail = options.detail ?? room();
  const roomGateway = options.gateway ?? gateway();
  const socket = options.socket ?? new FakeRoomSocket();
  const value: GameModuleContextValue = {
    user: { userId: currentUserId, displayName: currentUserId === "1" ? "나" : "상대방" },
    config: {
      soloApiBaseUrl: "/api",
      roomApiBaseUrl: "/api",
      gameWebSocketUrl: "ws://game",
      roomWebSocketBaseUrl: "ws://game/ws/game-rooms",
      rtcConfigApiBaseUrl: "/api/webrtc/ice-servers",
      aiWebSocketUrl: "ws://ai",
    },
    services: {
      battleRoomGateway: roomGateway,
      roomRealtimeSocketFactory: { create: () => socket as unknown as RoomRealtimeSocket },
    } as unknown as GameModuleServices,
    battleMediaSession: options.media ?? new MockBattleMediaSession(),
    sharedCameraSession: options.camera ?? emptyCamera(),
    battleRoomSession: { ...detail, currentUser: { userId: currentUserId, displayName: currentUserId === "1" ? "나" : "상대방" } },
    setBattleRoomSession: vi.fn(),
  };
  return render(
    <GameModuleContext.Provider value={value}>
      <MemoryRouter initialEntries={["/game/battle/1"]}>
        <Routes>
          <Route path="/game/battle" element={<span>LIST_ROUTE</span>} />
          <Route path="/game/battle/:roomId" element={<BattleWaitingRoomPage />} />
          <Route path="/game/battle/:roomId/play" element={<span>PLAY_ROUTE</span>} />
        </Routes>
      </MemoryRouter>
    </GameModuleContext.Provider>,
  );
}

function gateway(overrides: Partial<BattleRoomGateway> = {}): BattleRoomGateway {
  return {
    getRooms: vi.fn(async () => []),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    getRoom: vi.fn(async () => room()),
    setReady: vi.fn(async () => session()),
    leaveRoom: vi.fn(async () => undefined),
    startGame: vi.fn(async () => undefined),
    returnToWaiting: vi.fn(async () => undefined),
    ...overrides,
  };
}

function room(options: {
  full?: boolean;
  hostReady?: boolean;
  guestReady?: boolean;
  currentUserReady?: boolean;
} = {}): BattleRoomDetail {
  const full = options.full ?? false;
  const participants = [
    { userId: "1", displayName: "나", isHost: true, ready: options.hostReady ?? false },
    ...(full ? [{ userId: "2", displayName: "상대방", isHost: false, ready: options.guestReady ?? false }] : []),
  ];
  return {
    roomId: "1",
    roomCode: "ABC123",
    title: "지문자 대전방",
    status: full ? "FULL" : "WAITING",
    playerCount: participants.length,
    maxPlayers: 2,
    hostUserId: "1",
    hostName: "나",
    difficulty: "기본",
    symbolRange: [],
    createdAt: null,
    canJoin: !full,
    participants,
    hostReady: options.hostReady ?? false,
    guestReady: options.guestReady ?? false,
    currentUserReady: options.currentUserReady ?? false,
    canStart: full && Boolean(options.hostReady) && Boolean(options.guestReady),
    rematch: false,
    activeMatchId: null,
    matchStartAt: null,
  };
}

function session(options: Parameters<typeof room>[0] = {}): BattleRoomSession {
  return { ...room(options), currentUser: { userId: "1", displayName: "나" } };
}

function cameraFixture(onStart?: () => void) {
  const track = { kind: "video", readyState: "live", enabled: true } as MediaStreamTrack;
  const stream = { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream;
  let current: MediaStream | null = null;
  const camera: SharedGameCameraSession = {
    start: vi.fn(async () => { onStart?.(); current = stream; return stream; }),
    getStream: () => current,
    getVideoTrack: () => track,
    stop: vi.fn(),
  };
  return { camera, stream };
}

function emptyCamera(): SharedGameCameraSession {
  return {
    start: vi.fn(async () => { throw new Error("not configured"); }),
    getStream: () => null,
    getVideoTrack: () => null,
    stop: vi.fn(),
  };
}
