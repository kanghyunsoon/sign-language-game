// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type { SoloGameApi } from "../contracts";
import { StandaloneGameHarness } from "../dev/StandaloneGameHarness";
import { GameModule, type GameModuleConfig } from "./GameModule";
import { useGameModuleContext } from "./GameModuleContext";
import { GameServiceProvider } from "./GameServiceProvider";

vi.mock("../block-stacking/pages/SoloGamePage", () => ({ SoloGamePage: () => <h1>솔로 게임 화면</h1> }));
vi.mock("../glyph-battle/dev/LineRaceDevHarnessPage", () => ({ LineRaceDevHarnessPage: () => <h1>라인 레이스 개발 Harness</h1> }));
vi.mock("../glyph-battle/pages/GlyphTurnBotPracticePage", () => ({ GlyphTurnBotPracticePage: () => <div data-testid="glyph-turn-bot-practice-stub" /> }));

const config: GameModuleConfig = {
  soloApiBaseUrl: "/solo-api",
  roomApiBaseUrl: "/room-api",
  gameWebSocketUrl: "ws://game.test/ws",
  rtcConfigApiBaseUrl: "/rtc-api",
  aiWebSocketUrl: "ws://ai.test/ws",
};

afterEach(cleanup);

describe("GameModule", () => {
  it("renders the otter game selection cards at /game with the host user", () => {
    renderGameModule();
    expect(screen.getByRole("heading", { name: "수어의 달인" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "지문자 테트리스 선택" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "수달 배틀 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /무궁화 꽃/ })).toBeTruthy();
    expect(screen.getByText("테스트 사용자")).toBeTruthy();
  });

  it("shows a cute development notice when the flower game is selected", () => {
    renderGameModule();
    fireEvent.click(screen.getByRole("button", { name: /무궁화 꽃/ }));
    expect(screen.getByRole("dialog", { name: "수달이 개발중.." })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기다릴게!" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("navigates through the block mode page to the existing solo route", () => {
    renderGameModule();
    fireEvent.click(screen.getByRole("link", { name: "지문자 테트리스 선택" }));
    expect(screen.getByRole("heading", { name: "지문자 테트리수" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "솔로 게임 시작" }));
    expect(screen.getByRole("heading", { name: "솔로 게임 화면" })).toBeTruthy();
  });

  it("navigates through the block mode page to the existing battle room list", async () => {
    const getRooms = vi.fn(async () => []);
    renderGameModule({ serviceOverrides: { battleRoomGateway: fakeBattleRoomGateway({ getRooms }) } });
    fireEvent.click(screen.getByRole("link", { name: "지문자 테트리스 선택" }));
    fireEvent.click(screen.getByRole("link", { name: "실시간 1대1 게임 찾기" }));
    expect(screen.getByRole("heading", { name: "게임방 찾기" })).toBeTruthy();
    await waitFor(() => expect(getRooms).toHaveBeenCalledTimes(1));
  });

  it("shows only the supported solo and real-time battle modes", () => {
    renderGameModule();
    fireEvent.click(screen.getByRole("link", { name: "지문자 테트리스 선택" }));
    expect(screen.getByRole("link", { name: "솔로 게임 시작" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "실시간 1대1 게임 찾기" })).toBeTruthy();
    expect(screen.queryByText("협동 게임")).toBeNull();
  });

  it("returns from the block mode page to category selection", () => {
    renderGameModule({}, "/game/block");
    fireEvent.click(screen.getByRole("link", { name: /게임 선택/ }));
    expect(screen.getByRole("heading", { name: "수어의 달인" })).toBeTruthy();
  });

  it("supports direct entry to the existing solo route", () => {
    renderGameModule({}, "/game/solo");
    expect(screen.getByRole("heading", { name: "솔로 게임 화면" })).toBeTruthy();
  });

  it("supports direct entry to the existing battle route", async () => {
    const getRooms = vi.fn(async () => []);
    renderGameModule({ serviceOverrides: { battleRoomGateway: fakeBattleRoomGateway({ getRooms }) } }, "/game/battle");
    expect(screen.getByRole("heading", { name: "게임방 찾기" })).toBeTruthy();
    await waitFor(() => expect(getRooms).toHaveBeenCalledTimes(1));
  });

  it("registers the crowd recognition harness route in development", () => {
    renderGameModule({}, "/game/recognition/crowd-test");
    expect(screen.getByRole("heading", { name: "군중 환경 인식 Harness" })).toBeTruthy();
  });

  it("calls the host onExit callback", () => {
    const onExit = vi.fn();
    renderGameModule({ onExit });
    fireEvent.click(screen.getByRole("button", { name: "이전 화면으로 돌아가기" }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("passes user, access token, config, and service overrides through the provider", () => {
    const soloGameApi = fakeSoloGameApi();
    function Probe() {
      const value = useGameModuleContext();
      return <output>{`${value.user.userId}|${value.accessToken}|${value.config.aiWebSocketUrl}|${value.services.soloGameApi === soloGameApi}`}</output>;
    }
    render(
      <GameServiceProvider
        user={{ userId: "user-7", displayName: "사용자" }}
        accessToken="token-7"
        config={config}
        serviceOverrides={{ soloGameApi }}
      >
        <Probe />
      </GameServiceProvider>,
    );
    expect(screen.getByText("user-7|token-7|ws://ai.test/ws|true")).toBeTruthy();
  });

  it("runs the standalone harness", () => {
    render(
      <MemoryRouter initialEntries={["/game"]}>
        <Routes>
          <Route path="/game/*" element={<StandaloneGameHarness config={config} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "수어의 달인" })).toBeTruthy();
    expect(screen.getByText("개발 사용자")).toBeTruthy();
  });
  it("keeps the game category canvas at a fixed 16:9 ratio across browser zoom", () => {
    renderGameModule();
    const wheel = new WheelEvent("wheel", { ctrlKey: true, deltaY: -100, cancelable: true });
    const keyboard = new KeyboardEvent("keydown", { ctrlKey: true, key: "+", cancelable: true });
    window.dispatchEvent(wheel); window.dispatchEvent(keyboard);
    expect(wheel.defaultPrevented).toBe(false);
    expect(keyboard.defaultPrevented).toBe(false);
    const canvas = document.querySelector<HTMLElement>("[data-fixed-game-canvas='true']");
    expect(canvas).not.toBeNull();
    expect(canvas?.style.transform).toContain("translate(-50%, -50%) scale(");
    expect(document.querySelector("[data-game-module='true']")?.children).toHaveLength(1);
  });
});

function renderGameModule(overrides: Partial<ComponentProps<typeof GameModule>> = {}, initialEntry = "/game") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/game/*"
          element={(
            <GameModule
              user={{ userId: "user-1", displayName: "테스트 사용자" }}
              config={config}
              {...overrides}
            />
          )}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function fakeBattleRoomGateway(overrides: Partial<import("../block-stacking/battle/room").BattleRoomGateway> = {}): import("../block-stacking/battle/room").BattleRoomGateway {
  return {
    getRooms: vi.fn(async () => []),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    getRoom: vi.fn(),
    leaveRoom: vi.fn(async () => undefined),
    startGame: vi.fn(async () => undefined),
    returnToWaiting: vi.fn(async () => undefined),
    ...overrides,
  };
}

function fakeSoloGameApi(): SoloGameApi {
  return {
    startSession: vi.fn(async (request) => ({ ...request, soloSessionId: "session-1", userId: "user-1", startedAt: 1 })),
    completeSession: vi.fn(async (soloSessionId, request) => ({ ...request, soloSessionId, userId: "user-1", playMode: "AI", difficulty: "BEGINNER", startedAt: 1 })),
    getResults: vi.fn(async () => []),
    getRank: vi.fn(async () => null),
  };
}
