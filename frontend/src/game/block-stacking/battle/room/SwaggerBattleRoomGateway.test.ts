import { describe, expect, it, vi } from "vitest";
import { SwaggerBattleRoomGateway } from "./SwaggerBattleRoomGateway";

const apiRoom = (overrides: Record<string, unknown> = {}) => ({
  id: 10, roomCode: "ABC123", hostUserId: 1, guestUserId: null,
  hostReady: false, guestReady: false, status: "WAITING", participantCount: 1,
  capacity: 2, gameType: "TETRIS_DUEL", roomTitle: "자음 연습방", hostName: "수달왕", symbolRange: "CONSONANT", ...overrides,
});

function response(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } }); }
function createGateway(fetcher: typeof fetch) { return new SwaggerBattleRoomGateway({ baseUrl: "/api", currentUser: { userId: "1", displayName: "수달왕" }, fetch: fetcher }); }

describe("SwaggerBattleRoomGateway", () => {
  it("creates rooms using the new roomTitle and scalar symbolRange contract", async () => {
    let init: RequestInit | undefined;
    const gateway = createGateway(vi.fn(async (_input: RequestInfo | URL, request?: RequestInit) => { init = request; return response(apiRoom()); }));
    const created = await gateway.createRoom({ roomTitle: "자음 연습방", symbolRange: "CONSONANT" });
    expect(JSON.parse(String(init?.body))).toEqual({ gameType: "TETRIS_DUEL", roomTitle: "자음 연습방", symbolRange: "CONSONANT" });
    expect(created).toMatchObject({ title: "자음 연습방", hostName: "수달왕", symbolRange: "CONSONANT" });
  });

  it("uses only the latest SSE room metadata for the lobby", () => {
    const gateway = createGateway(vi.fn());
    const state = gateway as unknown as { applyLobbySnapshot(rooms: readonly unknown[]): void; currentRooms(): readonly unknown[] };
    state.applyLobbySnapshot([{ id: 10, roomCode: "ABC123", status: "WAITING", participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL", title: "실제 방 제목", hostName: "새 방장", symbolRange: "VOWEL" }]);
    expect(state.currentRooms()).toEqual([expect.objectContaining({ title: "실제 방 제목", hostName: "새 방장", symbolRange: "VOWEL" })]);
    state.applyLobbySnapshot([{ id: 10, roomCode: "ABC123", status: "WAITING", participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL", title: "위임 후 제목", hostName: "위임된 방장", symbolRange: "ALL" }]);
    expect(state.currentRooms()).toEqual([expect.objectContaining({ title: "위임 후 제목", hostName: "위임된 방장", symbolRange: "ALL" })]);
  });

  it("does not read browser storage to fill room title or host name", () => {
    const getItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem } });
    createGateway(vi.fn());
    expect(getItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
