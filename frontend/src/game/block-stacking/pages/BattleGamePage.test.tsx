// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { GameModuleContext, type GameModuleContextValue } from "../../app/GameModuleContext";
import type { GameModuleServices } from "../../contracts";
import type { SharedGameCameraSession } from "../../media/camera/SharedGameCameraSession";
import type { RemoteGameParticipant } from "../../media/core/mediaTypes";
import { MockBattleMediaSession } from "../../media/mock/MockBattleMediaSession";
import { BattleGamePage } from "./BattleGamePage";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BattleGamePage", () => {
  it("renders only the first remote participant in the current 1:1 layout", () => {
    const media = new MockBattleMediaSession();
    media.setRemoteParticipants([participant(1), participant(2)]);
    const value: GameModuleContextValue = {
      user: { userId: "local", displayName: "Local" },
      config: {
        soloApiBaseUrl: "/solo",
        roomApiBaseUrl: "/rooms",
        gameWebSocketUrl: "ws://game",
        rtcConfigApiBaseUrl: "/rtc",
        aiWebSocketUrl: "ws://ai",
      },
      services: {} as GameModuleServices,
      battleMediaSession: media,
      sharedCameraSession: emptyCameraSession(),
      battleRoomSession: null,
      setBattleRoomSession: vi.fn(),
    };

    render(
      <GameModuleContext.Provider value={value}>
        <MemoryRouter initialEntries={["/game/battle/room-1/play"]}>
          <Routes><Route path="/game/battle/:roomId/play" element={<BattleGamePage />} /></Routes>
        </MemoryRouter>
      </GameModuleContext.Provider>,
    );

    expect(screen.getByLabelText("Player 1 영상")).toBeTruthy();
    expect(screen.queryByLabelText("Player 2 영상")).toBeNull();
    expect(screen.getByText("현재 1:1 화면은 첫 번째 상대 영상만 표시합니다.")).toBeTruthy();
  });
});

function participant(index: number): RemoteGameParticipant {
  return {
    participantId: `p${index}`,
    displayName: `Player ${index}`,
    stream: null,
    cameraEnabled: false,
    connectionState: "CONNECTED",
  };
}

function emptyCameraSession(): SharedGameCameraSession {
  return {
    start: async () => { throw new Error("not used"); },
    getStream: () => null,
    getVideoTrack: () => null,
    stop: () => undefined,
  };
}
