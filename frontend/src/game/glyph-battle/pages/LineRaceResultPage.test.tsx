// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GameModuleContext,
  type GameModuleContextValue,
} from "../../app/GameModuleContext";
import type { LineRaceMatchFinishedEvent } from "../contracts";
import { LineRaceResultPage } from "./LineRaceResultPage";
import { LineRaceRoomSessionAdapter } from "../session/LineRaceRoomSessionAdapter";
afterEach(cleanup);
const me = "10000000-0000-4000-8000-000000000001",
  other = "20000000-0000-4000-8000-000000000001",
  match = "40000000-0000-4000-8000-000000000001";
describe("LineRaceResultPage", () => {
  it("renders official result statistics and keeps media for a rematch", async () => {
    const value = context();
    renderPage(value);
    expect(screen.getByRole("heading", { name: "승리" })).toBeTruthy();
    expect(screen.getAllByText(/기술 성공 2\/3/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "재대전" }));
    await waitFor(() =>
      expect(
        value.services.lineRaceRoomGateway?.returnToWaiting,
      ).toHaveBeenCalled(),
    );
    expect(value.lineRaceMediaSession?.disconnect).not.toHaveBeenCalled();
    expect(value.sharedCameraSession.stop).not.toHaveBeenCalled();
  });
  it("cleans Room media, camera and game WebSocket when leaving to the lobby", async () => {
    const value = context();
    renderPage(value);
    fireEvent.click(screen.getByRole("button", { name: "턴 배틀 로비" }));
    await waitFor(() =>
      expect(value.lineRaceMediaSession?.disconnect).toHaveBeenCalled(),
    );
    expect(value.lineRaceTransport?.disconnect).toHaveBeenCalled();
    expect(value.sharedCameraSession.stop).toHaveBeenCalled();
  });
  it("renders an authoritative DRAW without assigning either side a win", () => {
    const value = context();
    const { winnerPlayerId: _winner, loserPlayerId: _loser, ...drawBase } = result;
    const draw: LineRaceMatchFinishedEvent = { ...drawBase, finishReason: "DRAW" };
    renderPage(value, draw);
    expect(screen.getByRole("heading", { name: "무승부" })).toBeTruthy();
    expect(screen.getByText("DRAW")).toBeTruthy();
  });
  it("keeps device telemetry out of the clean result screen and clears it with the result", () => {
    const value=context(); LineRaceRoomSessionAdapter.saveResult(result,{scope:"THIS_DEVICE_ONLY",leaderChanges:3,attackRejectionReasons:{ATTACK_COOLDOWN:2}});
    renderPage(value); expect(screen.queryByText(/선두 변경|ATTACK_COOLDOWN/)).toBeNull();
    LineRaceRoomSessionAdapter.clearResult(match); expect(LineRaceRoomSessionAdapter.getDeviceSummary(match)).toBeUndefined();
  });
});
function renderPage(value: GameModuleContextValue, event: LineRaceMatchFinishedEvent = result) {
  render(
    <GameModuleContext.Provider value={value}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/game/line-race/matches/${match}/result`,
            state: { result: event },
          },
        ]}
      >
        <Routes>
          <Route
            path="/game/line-race/matches/:matchId/result"
            element={<LineRaceResultPage />}
          />
          <Route path="/game/line-race" element={<p>Lobby</p>} />
          <Route
            path="/game/line-race/rooms/:roomId"
            element={<p>Waiting</p>}
          />
        </Routes>
      </MemoryRouter>
    </GameModuleContext.Provider>,
  );
}
const result: LineRaceMatchFinishedEvent = {
  type: "LINE_RACE_MATCH_FINISHED",
  eventId: "70000000-0000-4000-8000-000000000001",
  matchId: match,
  roomId: "30000000-0000-4000-8000-000000000001",
  winnerPlayerId: me,
  loserPlayerId: other,
  finishReason: "FINISH_LINE",
  startedAt: 0,
  finishedAt: 1000,
  sequence: 20,
  occurredAt: 1000,
  results: [player(me, 1000), player(other, 900)],
};
function player(playerId: string, progress: number) {
  return {
    playerId,
    finalProgress: progress,
    attacksAttempted: 3,
    attacksAccepted: 2,
    countersAttempted: 2,
    countersSucceeded: 1,
    obstaclesTraversed: 1,
    accumulatedPenaltyMs: 1800,
    maxCombo: 2,
    averageRecognitionMs: 300,
    symbolStatistics: [
      {
        symbol: "ㄱ",
        recognitionAttempts: 2,
        recognitionSuccesses: 2,
        attackSuccesses: 1,
        counterAttempts: 1,
        counterSuccesses: 1,
        averageRecognitionMs: 300,
      },
    ],
  };
}
function context(): GameModuleContextValue {
  const gateway = {
    getRooms: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    joinByCode: vi.fn(),
    getRoom: vi.fn(async () => ({ ...room })),
    leaveRoom: vi.fn(async () => undefined),
    startGame: vi.fn(),
    returnToWaiting: vi.fn(),
  };
  const media = {
    connect: vi.fn(),
    syncParticipants: vi.fn(),
    disconnect: vi.fn(),
    setCameraEnabled: vi.fn(),
    getLocalStream: vi.fn(() => null),
    getRemoteParticipants: vi.fn(() => []),
    getConnectionState: vi.fn(() => "CONNECTED" as const),
    isCameraEnabled: vi.fn(() => true),
    subscribe: vi.fn(() => () => undefined),
  };
  const transport = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    requestSnapshot: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    subscribeConnectionState: vi.fn(() => () => undefined),
    getConnectionState: vi.fn(() => "CONNECTED" as const),
  };
  return {
    user: { userId: me, displayName: "나" },
    config: {
      soloApiBaseUrl: "/api",
      roomApiBaseUrl: "/api",
      gameWebSocketUrl: "ws://game",
      aiWebSocketUrl: "ws://ai",
    },
    services: { lineRaceRoomGateway: gateway } as never,
    battleMediaSession: media,
    lineRaceMediaSession: media,
    lineRaceTransport: transport,
    sharedCameraSession: {
      start: vi.fn(),
      stop: vi.fn(),
      getStream: vi.fn(() => null),
      isStarted: vi.fn(() => true),
      subscribe: vi.fn(() => () => undefined),
    } as never,
    battleRoomSession: null,
    setBattleRoomSession: vi.fn(),
    lineRaceRoomSession: {
      ...room,
      currentUser: { userId: me, displayName: "나" },
    },
    setLineRaceRoomSession: vi.fn(),
  };
}
const room = {
  roomId: "30000000-0000-4000-8000-000000000001",
  title: "Race",
  status: "FINISHED" as const,
  playerCount: 2,
  maxPlayers: 2,
  hostUserId: me,
  hostName: "나",
  difficulty: "NORMAL",
  symbolRange: ["ㄱ", "ㄴ"],
  createdAt: null,
  canJoin: false,
  participants: [
    { userId: me, displayName: "나", isHost: true },
    { userId: other, displayName: "상대", isHost: false },
  ],
  canStart: false,
  rematch: false,
  activeMatchId: match,
  matchStartAt: 0,
  gameType: "LINE_RACE" as const,
  visibility: "PUBLIC" as const,
  roomCode: null,
  matchDurationMs: 60000,
};
