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
  it("renders two game category cards at /game with the host user", () => {
    renderGameModule();
    expect(screen.getByRole("heading", { name: "게임 선택" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "블록 쌓기" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "지문자 월드 배틀" })).toBeTruthy();
    expect(screen.getByText(/테스트 사용자님/)).toBeTruthy();
  });

  it("navigates through the block mode page to the existing solo route", () => {
    renderGameModule();
    fireEvent.click(screen.getAllByRole("link", { name: "선택" })[0]);
    expect(screen.getByRole("heading", { name: "게임 모드" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /싱글 게임/ }));
    expect(screen.getByRole("heading", { name: "솔로 게임 화면" })).toBeTruthy();
  });

  it("navigates through the block mode page to the existing battle room list", async () => {
    const getRooms = vi.fn(async () => []);
    renderGameModule({ serviceOverrides: { battleRoomGateway: fakeBattleRoomGateway({ getRooms }) } });
    fireEvent.click(screen.getAllByRole("link", { name: "선택" })[0]);
    fireEvent.click(screen.getByRole("link", { name: /1:1 대전/ }));
    expect(screen.getByRole("heading", { name: "대전방" })).toBeTruthy();
    await waitFor(() => expect(getRooms).toHaveBeenCalledTimes(1));
  });

  it("keeps cooperative mode disabled", () => {
    renderGameModule();
    fireEvent.click(screen.getAllByRole("link", { name: "선택" })[0]);
    const cooperative = screen.getByText("협동 게임").closest("div");
    expect(cooperative?.getAttribute("aria-disabled")).toBe("true");
    expect(cooperative?.closest("a")).toBeNull();
  });

  it("opens the line-race placeholder and returns to category selection", () => {
    renderGameModule();
    fireEvent.click(screen.getAllByRole("link", { name: "선택" })[1]);
    expect(screen.getByRole("heading", { name: "지문자 턴 배틀" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "턴제 봇 연습" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /게임 선택으로 돌아가기/ }));
    expect(screen.getByRole("heading", { name: "게임 선택" })).toBeTruthy();
  });

  it("returns from the block mode page to category selection", () => {
    renderGameModule({}, "/game/block");
    fireEvent.click(screen.getByRole("link", { name: /게임 선택/ }));
    expect(screen.getByRole("heading", { name: "게임 선택" })).toBeTruthy();
  });

  it("supports direct entry to the existing solo route", () => {
    renderGameModule({}, "/game/solo");
    expect(screen.getByRole("heading", { name: "솔로 게임 화면" })).toBeTruthy();
  });

  it("supports direct entry to the existing battle route", async () => {
    const getRooms = vi.fn(async () => []);
    renderGameModule({ serviceOverrides: { battleRoomGateway: fakeBattleRoomGateway({ getRooms }) } }, "/game/battle");
    expect(screen.getByRole("heading", { name: "대전방" })).toBeTruthy();
    await waitFor(() => expect(getRooms).toHaveBeenCalledTimes(1));
  });

  it("supports direct entry to the line-race placeholder route", () => {
    renderGameModule({}, "/game/line-race");
    expect(screen.getByRole("heading", { name: "지문자 턴 배틀" })).toBeTruthy();
  });

  it("does not register line-race developer routes without the explicit dev-tools flag", () => {
    renderGameModule({}, "/game/line-race/dev");
    expect(screen.queryByRole("heading", { name: "라인 레이스 개발 Harness" })).toBeNull();
    cleanup();
    renderGameModule({}, "/game/line-race/practice");
    expect(screen.getByTestId("glyph-turn-bot-practice-stub")).toBeTruthy();
  });

  it("registers the crowd recognition harness route in development", () => {
    renderGameModule({}, "/game/recognition/crowd-test");
    expect(screen.getByRole("heading", { name: "군중 환경 인식 Harness" })).toBeTruthy();
  });

  it("calls the host onExit callback", () => {
    const onExit = vi.fn();
    renderGameModule({ onExit });
    fireEvent.click(screen.getByRole("button", { name: /나가기/ }));
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
    render(<StandaloneGameHarness config={config} />);
    expect(screen.getByRole("heading", { name: "게임 선택" })).toBeTruthy();
    expect(screen.getByText(/개발 사용자님/)).toBeTruthy();
  });
  it("prevents browser zoom shortcuts while the game module is mounted", () => {
    renderGameModule();
    const wheel = new WheelEvent("wheel", { ctrlKey: true, deltaY: -100, cancelable: true });
    const keyboard = new KeyboardEvent("keydown", { ctrlKey: true, key: "+", cancelable: true });
    window.dispatchEvent(wheel); window.dispatchEvent(keyboard);
    expect(wheel.defaultPrevented).toBe(true);
    expect(keyboard.defaultPrevented).toBe(true);
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
  };
}
