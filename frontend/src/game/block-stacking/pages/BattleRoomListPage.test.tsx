// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { GameModuleContext, type GameModuleContextValue } from "../../app/GameModuleContext";
import type { BattleRoomGateway, BattleRoomSession, BattleRoomSummary } from "../battle/room";
import type { GameModuleServices } from "../../contracts";
import { MockBattleMediaSession } from "../../media/mock/MockBattleMediaSession";
import { BattleRoomListPage } from "./BattleRoomListPage";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("BattleRoomListPage", () => {
  it("shows room status, host, difficulty, range and player count", async () => {
    renderPage(gateway({ getRooms: vi.fn(async () => [summary()]) }));
    expect(await screen.findByRole("heading", { name: "입문 연습방" })).toBeTruthy();
    expect(screen.getByText("나사용자")).toBeTruthy();
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByText("ㄱ · ㄴ")).toBeTruthy();
  });

  it("polls rooms using the configured interval", async () => {
    vi.useFakeTimers();
    const getRooms = vi.fn(async () => [summary()]);
    renderPage(gateway({ getRooms }), 100);
    await vi.advanceTimersByTimeAsync(0);
    expect(getRooms).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(getRooms).toHaveBeenCalledTimes(2);
  });

  it("creates a room and navigates to its waiting room", async () => {
    const createRoom = vi.fn(async () => session());
    renderPage(gateway({ createRoom }));
    fireEvent.click(screen.getByRole("button", { name: "방 만들기" }));
    fireEvent.change(screen.getByLabelText("방 제목"), { target: { value: "새 연습방" } });
    fireEvent.click(screen.getAllByRole("button", { name: "방 만들기" })[1]);
    await waitFor(() => expect(createRoom).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("WAITING_ROUTE")).toBeTruthy();
  });

  it("sends only one create request when the form is submitted repeatedly", async () => {
    let resolveCreate!: (value: BattleRoomSession) => void;
    const createRoom = vi.fn(() => new Promise<BattleRoomSession>((resolve) => { resolveCreate = resolve; }));
    renderPage(gateway({ createRoom }));
    fireEvent.click(screen.getByRole("button", { name: "방 만들기" }));
    fireEvent.change(screen.getByLabelText("방 제목"), { target: { value: "중복 방지" } });
    const submitButton = screen.getAllByRole("button", { name: "방 만들기" })[1];
    const form = submitButton.closest("form");
    if (!form) throw new Error("Create room form was not rendered.");

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(createRoom).toHaveBeenCalledTimes(1);
    resolveCreate(session());
    expect(await screen.findByText("WAITING_ROUTE")).toBeTruthy();
  });

  it("does not create another room while the user has an active room session", async () => {
    const createRoom = vi.fn(async () => session());
    renderPage(gateway({ createRoom }), 2_500, session());
    fireEvent.click(screen.getByRole("button", { name: "방 만들기" }));
    fireEvent.change(screen.getByLabelText("방 제목"), { target: { value: "중복 방지" } });
    fireEvent.click(screen.getAllByRole("button", { name: "방 만들기" })[1]);

    expect((await screen.findByRole("alert")).textContent).toContain("이미 참가 중인 방이 있습니다.");
    expect(createRoom).not.toHaveBeenCalled();
  });

  it("joins an available room", async () => {
    const joinRoom = vi.fn(async () => session());
    renderPage(gateway({ getRooms: vi.fn(async () => [summary()]), joinRoom }));
    fireEvent.click(await screen.findByRole("button", { name: "입장" }));
    await waitFor(() => expect(joinRoom).toHaveBeenCalledWith("room-1"));
    expect(await screen.findByText("WAITING_ROUTE")).toBeTruthy();
  });

  it("does not allow entry into an unavailable room", async () => {
    const fullRoom: BattleRoomSummary = { ...summary(), status: "FULL", canJoin: false, playerCount: 2 };
    renderPage(gateway({ getRooms: vi.fn(async () => [fullRoom]) }));
    expect(await screen.findByRole("button", { name: "입장 불가" })).toHaveProperty("disabled", true);
  });

  it("clears its polling timer when leaving the page", () => {
    const clearInterval = vi.spyOn(window, "clearInterval");
    const view = renderPage(gateway());
    view.unmount();
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });
});

function renderPage(roomGateway: BattleRoomGateway, interval = 2_500, activeSession: BattleRoomSession | null = null) {
  const value = contextValue(roomGateway, interval, activeSession);
  return render(<GameModuleContext.Provider value={value}><MemoryRouter initialEntries={["/game/battle"]}><Routes><Route path="/game/battle" element={<BattleRoomListPage />} /><Route path="/game/battle/:roomId" element={<span>WAITING_ROUTE</span>} /></Routes></MemoryRouter></GameModuleContext.Provider>);
}

function contextValue(roomGateway: BattleRoomGateway, interval: number, activeSession: BattleRoomSession | null): GameModuleContextValue {
  return {
    user: { userId: "user-1", displayName: "나사용자" }, accessToken: undefined,
    config: { soloApiBaseUrl: "/solo", roomApiBaseUrl: "/rooms", gameWebSocketUrl: "ws://game", rtcConfigApiBaseUrl: "/rtc", aiWebSocketUrl: "ws://ai", battleRoomPollingIntervalMs: interval },
    services: { battleRoomGateway: roomGateway } as unknown as GameModuleServices,
    battleMediaSession: new MockBattleMediaSession(), sharedCameraSession: { start: vi.fn(), getStream: () => null, getVideoTrack: () => null, stop: vi.fn() },
    battleRoomSession: activeSession, setBattleRoomSession: vi.fn(),
  };
}

function gateway(overrides: Partial<BattleRoomGateway> = {}): BattleRoomGateway {
  return { getRooms: vi.fn(async () => []), createRoom: vi.fn(), joinRoom: vi.fn(), getRoom: vi.fn(), leaveRoom: vi.fn(async () => undefined), startGame: vi.fn(async () => undefined), returnToWaiting: vi.fn(async () => undefined), ...overrides };
}

function summary(): BattleRoomSummary {
  return { roomId: "room-1", title: "입문 연습방", status: "WAITING", playerCount: 1, maxPlayers: 2, hostUserId: "user-1", hostName: "나사용자", difficulty: "EASY", symbolRange: ["ㄱ", "ㄴ"], createdAt: null, canJoin: true };
}

function session(): BattleRoomSession {
  return { ...summary(), participants: [{ userId: "user-1", displayName: "나사용자", isHost: true }], canStart: false, startBlockReason: "상대방 대기", rematch: false, activeMatchId: null, matchStartAt: null, currentUser: { userId: "user-1", displayName: "나사용자" } };
}
