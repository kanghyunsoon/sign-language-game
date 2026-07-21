import { describe, expect, it, vi } from "vitest";

import { BackendBattleRoomGateway } from "./BackendBattleRoomGateway";
import { DevBattleRoomGateway } from "./DevBattleRoomGateway";
import { mapRoomDetail } from "./roomMappers";

const user = { userId: "user-1", displayName: "나사용자" };

describe("BattleRoom gateways", () => {
  it("maps Dev API fields into the shared room model", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse([devRoom()]));
    const gateway = new DevBattleRoomGateway({ baseUrl: "http://dev/api/dev", currentUser: user, fetch });
    const rooms = await gateway.getRooms();
    expect(rooms[0]).toMatchObject({ title: "입문방", hostName: "나사용자", playerCount: 1, canJoin: true });
    expect(fetch).toHaveBeenCalledWith("http://dev/api/dev/rooms", expect.any(Object));
  });

  it("creates a Dev room without putting user identity in the request body", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(devRoom()));
    const gateway = new DevBattleRoomGateway({ baseUrl: "/api/dev", currentUser: user, fetch });
    await gateway.createRoom({ title: "새 방", difficulty: "EASY", symbolRange: ["ㄱ", "ㄴ"] });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ roomTitle: "새 방", maxPlayers: 2, difficulty: "EASY", symbolRange: ["ㄱ", "ㄴ"], rematch: false });
    expect(String(init.body)).not.toContain("user-1");
  });

  it("maps final backend participant and canStart fields separately", async () => {
    const payload = { ...devRoom(), title: "최종 API 방", roomTitle: undefined, status: "FULL", readyForGame: true, participants: [{ userId: "user-1", displayName: "나사용자", isHost: true }, { userId: "user-2", displayName: "상대", isHost: false }], canStart: true, createdAt: "2026-07-16T00:00:00Z" };
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse(payload));
    const gateway = new BackendBattleRoomGateway({ baseUrl: "/api/game", currentUser: user, fetch });
    const room = await gateway.getRoom("room-1");
    expect(room).toMatchObject({ title: "최종 API 방", hostName: "나사용자", playerCount: 2, canStart: true });
    expect(room.createdAt).toBe(Date.parse("2026-07-16T00:00:00Z"));
  });

  it("uses the server error message for a rejected third participant", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ code: "ROOM_FULL", message: "Room is full" }, 400));
    const gateway = new DevBattleRoomGateway({ baseUrl: "/api/dev", currentUser: user, fetch });
    await expect(gateway.joinRoom("room-1")).rejects.toThrow("Room is full");
  });

  it("disables joining for a full room", () => {
    const room = mapRoomDetail({ ...devRoom(), status: "FULL", playerIds: ["user-1", "user-2"], readyForGame: true }, user);
    expect(room.canJoin).toBe(false);
    expect(room.canStart).toBe(true);
  });
});

function devRoom() {
  return { roomId: "room-1", roomTitle: "입문방", hostUserId: "user-1", playerIds: ["user-1"], maxPlayers: 2, readyForGame: false, status: "WAITING", difficulty: "EASY", symbolRange: ["ㄱ", "ㄴ"], rematch: false };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
