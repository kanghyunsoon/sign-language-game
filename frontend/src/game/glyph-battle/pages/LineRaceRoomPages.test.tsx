// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameModuleContext, type GameModuleContextValue } from "../../app/GameModuleContext";
import { LineRaceLobbyPage } from "./LineRaceLobbyPage";
import { LineRaceWaitingRoomPage } from "./LineRaceWaitingRoomPage";

const user = { userId: "10000000-0000-4000-8000-000000000001", displayName: "나" };
const room = {
  roomId: "30000000-0000-4000-8000-000000000001", title: "레이스", status: "WAITING" as const,
  playerCount: 1, maxPlayers: 2, hostUserId: user.userId, hostName: "나", difficulty: "NORMAL",
  symbolRange: ["ㄱ", "ㄴ"], createdAt: null, canJoin: true, participants: [{ userId: user.userId, displayName: "나", isHost: true }],
  canStart: false, rematch: false, activeMatchId: null, matchStartAt: null, gameType: "LINE_RACE" as const,
  visibility: "PUBLIC" as const, roomCode: null, matchDurationMs: 60_000,
};

function botRoom(canStart = true) {
  return { ...room, playerCount: 2, canStart, participants: [...room.participants,
    { userId: "20000000-0000-4000-8000-000000000001", displayName: "연습 Bot", isHost: false, isBot: true }] };
}

function liveCamera() {
  const track = Object.assign(new EventTarget(), { readyState: "live" }) as unknown as MediaStreamTrack;
  const stream = { getVideoTracks: () => [track] } as unknown as MediaStream;
  return { track, stream };
}

function connectedTransport(value: GameModuleContextValue) {
  vi.mocked(value.lineRaceTransport!.getConnectionState).mockReturnValue("CONNECTED");
  vi.mocked(value.lineRaceTransport!.subscribeConnectionState).mockImplementation((listener) => {
    listener("CONNECTED");
    return () => undefined;
  });
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function context(overrides: Partial<GameModuleContextValue> = {}): GameModuleContextValue {
  const gateway = { getRooms: vi.fn(async () => []), createRoom: vi.fn(), joinRoom: vi.fn(), joinByCode: vi.fn(),
    getRoom: vi.fn(async () => room), leaveRoom: vi.fn(), startGame: vi.fn() };
  const media = { connect: vi.fn(async () => undefined), syncParticipants: vi.fn(async () => undefined), disconnect: vi.fn(async () => undefined),
    setCameraEnabled: vi.fn(), getLocalStream: vi.fn(() => null), getRemoteParticipants: vi.fn(() => []),
    getConnectionState: vi.fn(() => "DISCONNECTED" as const), isCameraEnabled: vi.fn(() => true), subscribe: vi.fn(() => () => undefined) };
  const transport = { connect: vi.fn(async () => undefined), disconnect: vi.fn(), send: vi.fn(), requestSnapshot: vi.fn(),
    subscribe: vi.fn(() => () => undefined), subscribeConnectionState: vi.fn((listener: (state: "DISCONNECTED") => void) => {
      listener("DISCONNECTED"); return () => undefined;
    }), getConnectionState: vi.fn(() => "DISCONNECTED" as const) };
  return { user, config: { soloApiBaseUrl: "/api", roomApiBaseUrl: "/api/dev", gameWebSocketUrl: "ws://game", aiWebSocketUrl: "ws://ai",
    battleRoomPollingIntervalMs: 2500 }, services: { lineRaceRoomGateway: gateway } as never,
    battleMediaSession: media, lineRaceMediaSession: media, lineRaceTransport: transport,
    sharedCameraSession: { start: vi.fn(async () => ({ getVideoTracks: () => [] } as unknown as MediaStream)), stop: vi.fn(),
      getStream: vi.fn(() => null), isStarted: vi.fn(() => false), subscribe: vi.fn(() => () => undefined) } as never,
    battleRoomSession: null, setBattleRoomSession: vi.fn(), lineRaceRoomSession: null, setLineRaceRoomSession: vi.fn(), ...overrides };
}

describe("line race room pages", () => {
  it("removes keyboard, mock-practice, and hard-coded duration copy from the user lobby", () => {
    const value = context();
    const view = render(<GameModuleContext.Provider value={value}><MemoryRouter><LineRaceLobbyPage /></MemoryRouter></GameModuleContext.Provider>);
    expect(screen.queryByText(/키보드/)).toBeNull();
    expect(screen.queryByText(/Mock Bot 연습/)).toBeNull();
    expect(screen.queryByText(/30초 게임 방법/)).toBeNull();
    expect(screen.getByText("게임 방법")).toBeTruthy();
    view.unmount();
  });

  it("opens the frontend turn practice instead of the legacy interval-attack server Bot", async () => {
    const value = context();
    render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/line-race"]}><Routes><Route path="/game/line-race" element={<LineRaceLobbyPage/>}/><Route path="/game/line-race/practice" element={<div data-testid="turn-practice-route"/>}/></Routes></MemoryRouter></GameModuleContext.Provider>);
    fireEvent.click(screen.getByRole("button", { name: "턴제 봇 연습" }));
    await waitFor(() => expect(screen.getByTestId("turn-practice-route")).toBeTruthy());
  });

  it("cleans lobby polling on unmount", () => {
    const clear = vi.spyOn(window, "clearInterval"); const value = context();
    const view = render(<GameModuleContext.Provider value={value}><MemoryRouter><LineRaceLobbyPage /></MemoryRouter></GameModuleContext.Provider>);
    view.unmount(); expect(clear).toHaveBeenCalled();
  });

  it("connects the shared camera, common Mesh session and game transport in the waiting room", async () => {
    const value = context();
    render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/line-race/rooms/" + room.roomId]}><Routes>
      <Route path="/game/line-race/rooms/:roomId" element={<LineRaceWaitingRoomPage />} />
    </Routes></MemoryRouter></GameModuleContext.Provider>);
    expect(value.lineRaceTransport?.connect).not.toHaveBeenCalled();
    await waitFor(() => expect(value.sharedCameraSession.start).toHaveBeenCalled());
    await waitFor(() => expect(value.lineRaceMediaSession?.connect).toHaveBeenCalledWith(expect.objectContaining({ gameType: "LINE_RACE" }), expect.anything()));
  });

  it("explains why start is disabled and treats a Bot without a camera as normal", async () => {
    const botRoom = { ...room, playerCount: 2, canStart: true, participants: [...room.participants,
      { userId: "20000000-0000-4000-8000-000000000001", displayName: "연습 Bot", isHost: false, isBot: true }] };
    const value = context({ lineRaceRoomSession: { ...botRoom, currentUser: user } as never });
    vi.mocked(value.services.lineRaceRoomGateway!.getRoom).mockResolvedValue(botRoom);
    vi.mocked(value.sharedCameraSession.start).mockRejectedValue(new DOMException("camera unavailable", "NotFoundError"));
    render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/line-race/rooms/" + room.roomId]}><Routes>
      <Route path="/game/line-race/rooms/:roomId" element={<LineRaceWaitingRoomPage />} />
    </Routes></MemoryRouter></GameModuleContext.Provider>);
    await waitFor(() => expect(screen.getAllByText("사용 안 함 (정상)").length).toBeGreaterThan(0));
    expect(screen.getByText("카메라 연결 필요")).toBeTruthy();
    expect((screen.getByRole("button", { name: "경기 시작" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("does not initialize or warn about peer media in a server Bot room", async () => {
    const botRoom = { ...room, playerCount: 2, canStart: true, participants: [...room.participants,
      { userId: "20000000-0000-4000-8000-000000000001", displayName: "연습 Bot", isHost: false, isBot: true }] };
    const value=context({lineRaceRoomSession:{...botRoom,currentUser:user} as never});
    vi.mocked(value.services.lineRaceRoomGateway!.getRoom).mockResolvedValue(botRoom);
    vi.mocked(value.lineRaceMediaSession!.syncParticipants).mockRejectedValue(new Error("Game media session is not connected."));
    vi.mocked(value.lineRaceMediaSession!.connect).mockRejectedValue(new Error("Game media session is not connected."));
    render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/line-race/rooms/"+room.roomId]}><Routes>
      <Route path="/game/line-race/rooms/:roomId" element={<LineRaceWaitingRoomPage/>}/>
    </Routes></MemoryRouter></GameModuleContext.Provider>);
    await waitFor(()=>expect(screen.getAllByText("사용 안 함 (정상)").length).toBeGreaterThan(0));
    expect(value.lineRaceMediaSession?.syncParticipants).not.toHaveBeenCalled();
    expect(value.lineRaceMediaSession?.connect).not.toHaveBeenCalled();
    expect(screen.queryByText(/Game media session is not connected/)).toBeNull();
  });

  it("uses the live local track for Bot camera status while RTC stays disconnected", async () => {
    const detail = botRoom();
    const camera = liveCamera();
    const value = context({ lineRaceRoomSession: { ...detail, currentUser: user } as never });
    vi.mocked(value.services.lineRaceRoomGateway!.getRoom).mockResolvedValue(detail);
    vi.mocked(value.sharedCameraSession.getStream).mockReturnValue(camera.stream);
    vi.mocked(value.sharedCameraSession.start).mockResolvedValue(camera.stream);
    vi.mocked(value.lineRaceMediaSession!.isCameraEnabled).mockReturnValue(false);
    connectedTransport(value);
    render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/line-race/rooms/" + room.roomId]}><Routes>
      <Route path="/game/line-race/rooms/:roomId" element={<LineRaceWaitingRoomPage />} />
    </Routes></MemoryRouter></GameModuleContext.Provider>);
    await waitFor(() => expect(screen.getByText("켜짐")).toBeTruthy());
    expect(screen.getAllByText("사용 안 함 (정상)").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("BOT · 정상")).toBeTruthy();
    expect(value.lineRaceMediaSession?.syncParticipants).not.toHaveBeenCalled();
    expect(value.lineRaceMediaSession?.connect).not.toHaveBeenCalled();
    expect(screen.queryByText(/영상 연결 경고/)).toBeNull();
    expect((screen.getByRole("button", { name: "경기 시작" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables Bot start with the displayed camera reason when no live track exists", async () => {
    const detail = botRoom();
    const emptyStream = { getVideoTracks: () => [] } as unknown as MediaStream;
    const value = context({ lineRaceRoomSession: { ...detail, currentUser: user } as never });
    vi.mocked(value.services.lineRaceRoomGateway!.getRoom).mockResolvedValue(detail);
    vi.mocked(value.sharedCameraSession.start).mockResolvedValue(emptyStream);
    connectedTransport(value);
    render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/line-race/rooms/" + room.roomId]}><Routes>
      <Route path="/game/line-race/rooms/:roomId" element={<LineRaceWaitingRoomPage />} />
    </Routes></MemoryRouter></GameModuleContext.Provider>);
    await waitFor(() => expect(screen.getAllByText("연결 필요").length).toBeGreaterThan(0));
    expect(screen.getByText("카메라 연결 필요")).toBeTruthy();
    expect((screen.getByRole("button", { name: "경기 시작" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("updates Bot status and start eligibility immediately when the live track ends", async () => {
    const detail = botRoom();
    const camera = liveCamera();
    const value = context({ lineRaceRoomSession: { ...detail, currentUser: user } as never });
    vi.mocked(value.services.lineRaceRoomGateway!.getRoom).mockResolvedValue(detail);
    vi.mocked(value.sharedCameraSession.getStream).mockReturnValue(camera.stream);
    vi.mocked(value.sharedCameraSession.start).mockResolvedValue(camera.stream);
    connectedTransport(value);
    render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/line-race/rooms/" + room.roomId]}><Routes>
      <Route path="/game/line-race/rooms/:roomId" element={<LineRaceWaitingRoomPage />} />
    </Routes></MemoryRouter></GameModuleContext.Provider>);
    const startButton = await screen.findByRole("button", { name: "경기 시작" }) as HTMLButtonElement;
    await waitFor(() => expect(startButton.disabled).toBe(false));
    await act(async () => {
      Object.assign(camera.track, { readyState: "ended" });
      camera.track.dispatchEvent(new Event("ended"));
    });
    await waitFor(() => expect(startButton.disabled).toBe(true));
    expect(screen.getByText("카메라 연결 필요")).toBeTruthy();
  });

  it("keeps peer media connection failures visible in a human room", async () => {
    const humanRoom = { ...room, playerCount: 2, participants: [...room.participants,
      { userId: "20000000-0000-4000-8000-000000000001", displayName: "상대", isHost: false, isBot: false }] };
    const value = context({ lineRaceRoomSession: { ...humanRoom, currentUser: user } as never });
    vi.mocked(value.services.lineRaceRoomGateway!.getRoom).mockResolvedValue(humanRoom);
    vi.mocked(value.lineRaceMediaSession!.connect).mockRejectedValue(new Error("Game media session is not connected."));
    render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/line-race/rooms/" + room.roomId]}><Routes>
      <Route path="/game/line-race/rooms/:roomId" element={<LineRaceWaitingRoomPage />} />
    </Routes></MemoryRouter></GameModuleContext.Provider>);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("영상 연결 경고: Game media session is not connected."));
  });
});
