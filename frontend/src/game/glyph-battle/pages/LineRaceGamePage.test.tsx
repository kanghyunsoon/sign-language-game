// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameModuleContext, type GameModuleContextValue } from "../../app/GameModuleContext";
import { PythonWebSocketSignRecognizer } from "../../recognition";
import { LineRaceGamePage } from "./LineRaceGamePage";
import type { LineRaceServerEvent } from "../contracts";

vi.mock("./LineRaceGameShell", () => ({ LineRaceGameShell: () => <div data-testid="network-race-canvas" /> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("LineRaceGamePage", () => {
  it("reuses waiting-room camera, Mesh and WebSocket sessions and requests a snapshot", async () => {
    mockRecognizer(); const value = context(); renderGame(value);
    await waitFor(() => expect(value.lineRaceTransport?.requestSnapshot).toHaveBeenCalledWith(matchId));
    expect(value.sharedCameraSession.start).not.toHaveBeenCalled();
    expect(value.lineRaceMediaSession?.connect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "경기 시작 동기화 중" })).toBeTruthy();
    (value.lineRaceTransport as TestTransport).emit(snapshotEvent());
    expect(await screen.findByTestId("network-race-canvas")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "상대방" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "상대방 영상" })).toBeTruthy();
  });

  it("never converts keyboard events into user attack or counter commands", async () => {
    mockRecognizer(); const value = context(); renderGame(value);
    await waitFor(() => expect(value.lineRaceTransport?.requestSnapshot).toHaveBeenCalledWith(matchId));
    fireEvent.keyDown(window, { key: "1" });
    fireEvent.keyDown(window, { key: "ㄱ" });
    fireEvent.keyDown(window, { key: " " });
    expect(value.lineRaceTransport?.send).not.toHaveBeenCalled();
  });

  it("navigates to the result screen only from the server FINISHED event", async () => {
    mockRecognizer(); const value = context(); renderGame(value);
    await waitFor(() => expect(value.lineRaceTransport?.requestSnapshot).toHaveBeenCalled());
    (value.lineRaceTransport as TestTransport).emit(finishedEvent());
    expect(await screen.findByText("Result screen")).toBeTruthy();
  });

  it("shows an explicit start synchronization error for an invalid WAITING snapshot", async () => {
    mockRecognizer(); const value = context(); renderGame(value);
    await waitFor(() => expect(value.lineRaceTransport?.requestSnapshot).toHaveBeenCalled());
    const valid = snapshotEvent();
    if (valid.type !== "LINE_RACE_MATCH_SNAPSHOT") throw new Error("snapshot fixture must be a snapshot event");
    (value.lineRaceTransport as TestTransport).emit({
      ...valid,
      snapshot: { ...valid.snapshot, status: "WAITING", myAttackHand: [] },
    });
    expect(await screen.findByRole("heading", { name: "경기 상태를 시작할 수 없음" })).toBeTruthy();
    expect(screen.getByText(/경기 시작 동기화 오류/)).toBeTruthy();
  });

  it("shows recovery failure and a lobby button after bounded reconnect attempts", async () => {
    vi.useFakeTimers(); mockRecognizer(); const value = context("ERROR"); renderGame(value);
    for (let attempt=0;attempt<4;attempt+=1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    }
    expect(screen.getByRole("heading", { name: "경기를 복구할 수 없음" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "로비 복귀" })).toBeTruthy();
    expect(value.lineRaceTransport?.connect).toHaveBeenCalledTimes(4);
  });
});

function mockRecognizer() {
  vi.spyOn(PythonWebSocketSignRecognizer.prototype, "connect").mockResolvedValue();
  vi.spyOn(PythonWebSocketSignRecognizer.prototype, "disconnect").mockImplementation(() => undefined);
}

function renderGame(value: GameModuleContextValue) {
  return render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={[`/game/line-race/matches/${matchId}`]}><Routes>
    <Route path="/game/line-race/matches/:matchId" element={<LineRaceGamePage />} />
    <Route path="/game/line-race/matches/:matchId/result" element={<p>Result screen</p>} />
    <Route path="/game/line-race" element={<p>Lobby screen</p>} />
  </Routes></MemoryRouter></GameModuleContext.Provider>);
}

const matchId = "40000000-0000-4000-8000-000000000001";
const user = { userId: "10000000-0000-4000-8000-000000000001", displayName: "나" };

type TestTransport = NonNullable<GameModuleContextValue["lineRaceTransport"]> & { emit(event: LineRaceServerEvent): void };

function context(initialState: "CONNECTED" | "ERROR" = "CONNECTED"): GameModuleContextValue {
  const stream = { getVideoTracks: () => [{ addEventListener: vi.fn(), removeEventListener: vi.fn() }] } as unknown as MediaStream;
  const media = { connect: vi.fn(), syncParticipants: vi.fn(), disconnect: vi.fn(), setCameraEnabled: vi.fn(), getLocalStream: vi.fn(() => stream),
    getRemoteParticipants: vi.fn(() => []), getConnectionState: vi.fn(() => "CONNECTED" as const), isCameraEnabled: vi.fn(() => true),
    subscribe: vi.fn(() => () => undefined) };
  let eventListener: (event: LineRaceServerEvent) => void = () => undefined;
  let stateListener: (state: "CONNECTED" | "ERROR" | "DISCONNECTED" | "CONNECTING") => void = () => undefined;
  let connectionState: "CONNECTED" | "ERROR" | "DISCONNECTED" | "CONNECTING" = initialState;
  const transport = { connect: vi.fn(async () => { if (initialState === "ERROR") { connectionState="ERROR";stateListener("ERROR");throw new Error("connect failed"); } connectionState="CONNECTED";stateListener("CONNECTED"); }),
    disconnect: vi.fn(() => { connectionState="DISCONNECTED";stateListener("DISCONNECTED"); }), send: vi.fn(), requestSnapshot: vi.fn(),
    subscribe: vi.fn((listener: typeof eventListener) => { eventListener=listener;return () => undefined; }),
    subscribeConnectionState: vi.fn((listener: typeof stateListener) => { stateListener=listener;listener(connectionState);return () => undefined; }),
    getConnectionState: vi.fn(() => connectionState), emit: (event: LineRaceServerEvent) => eventListener(event) };
  const glyphTransport = { connect: vi.fn(async () => undefined), disconnect: vi.fn(), send: vi.fn(), requestSnapshot: vi.fn(),
    subscribe: vi.fn(() => () => undefined), subscribeConnectionState: vi.fn(() => () => undefined), getConnectionState: vi.fn(() => "CONNECTED" as const) };
  return { user, config: { soloApiBaseUrl: "/api", roomApiBaseUrl: "/api/dev", gameWebSocketUrl: "ws://game", aiWebSocketUrl: "ws://ai" },
    services: {} as never, battleMediaSession: media, lineRaceMediaSession: media, lineRaceTransport: transport, glyphTurnTransport: glyphTransport,
    sharedCameraSession: { start: vi.fn(), stop: vi.fn(), getStream: vi.fn(() => stream), isStarted: vi.fn(() => true),
      subscribe: vi.fn(() => () => undefined) } as never,
    battleRoomSession: null, setBattleRoomSession: vi.fn(),
    lineRaceRoomSession: { roomId: "30000000-0000-4000-8000-000000000001", title: "1:1", status: "PLAYING", playerCount: 2,
      maxPlayers: 2, hostUserId: user.userId, hostName: "나", difficulty: "NORMAL", symbolRange: ["ㄱ", "ㄴ"], createdAt: null,
      canJoin: false, participants: [{ userId: user.userId, displayName: "나", isHost: true },
        { userId: "20000000-0000-4000-8000-000000000001", displayName: "상대방", isHost: false, isBot: false }],
      canStart: false, rematch: false, activeMatchId: matchId, matchStartAt: 0, gameType: "LINE_RACE", visibility: "PRIVATE",
      roomCode: "ABC", matchDurationMs: 60_000, currentUser: user }, setLineRaceRoomSession: vi.fn() };
}

function finishedEvent() { return { type:"LINE_RACE_MATCH_FINISHED" as const,eventId:"70000000-0000-4000-8000-000000000001",matchId,sequence:1,occurredAt:1000,roomId:"30000000-0000-4000-8000-000000000001",winnerPlayerId:user.userId,loserPlayerId:"20000000-0000-4000-8000-000000000001",finishReason:"TIME_LIMIT" as const,results:[],startedAt:0,finishedAt:1000 }; }
function snapshotEvent(): LineRaceServerEvent { return { type:"LINE_RACE_MATCH_SNAPSHOT",eventId:"70000000-0000-4000-8000-000000000002",matchId,sequence:2,occurredAt:1_000,snapshot:{matchId,roomId:"30000000-0000-4000-8000-000000000001",status:"COUNTDOWN",serverTime:1_000,startAt:2_000,finishDeadlineAt:62_000,sequence:1,myAttackHand:["ㄱ","ㄴ","ㅁ"],config:{raceLength:1_000,baseSpeedPerSecond:28,matchDurationMs:60_000,countdownMs:3_000,handSize:3,attackCooldownMs:900,counterWindowMs:2_500,obstacleLeadDistance:180,minimumObstacleSpacing:90,maxPendingObstacles:6,reconnectGraceMs:10_000,supportedSymbols:["ㄱ","ㄴ","ㅁ"]},players:[{playerId:user.userId,progress:0,score:0,combo:0,maxCombo:0,pendingObstacleIds:[],accumulatedPenaltyMs:0,connected:true,state:"RUNNING"},{playerId:"20000000-0000-4000-8000-000000000001",progress:0,score:0,combo:0,maxCombo:0,pendingObstacleIds:[],accumulatedPenaltyMs:0,connected:true,state:"RUNNING"}],obstacles:[]}}; }
