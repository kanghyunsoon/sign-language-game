import { describe, expect, it, vi } from "vitest";
import { DevBattleRoomGateway } from "./DevBattleRoomGateway";

describe("BattleRoom gateway request mapping", () => {
  it("does not include difficulty in a room creation request", async () => {
    let request: RequestInit | undefined;
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      request = init;
      return new Response(JSON.stringify(room()), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const gateway = new DevBattleRoomGateway({ baseUrl: "/api/dev", currentUser: { userId: "user-1", displayName: "사용자" }, fetch });
    await gateway.createRoom({ roomTitle: "테스트 방", symbolRange: "CONSONANT" });
    expect(JSON.parse(String(request?.body))).toEqual({ roomTitle: "테스트 방", maxPlayers: 2, symbolRange: "CONSONANT", rematch: false });
  });
});

function room() { return { roomId: "room-1", roomTitle: "테스트 방", hostUserId: "user-1", playerIds: ["user-1"], maxPlayers: 2, readyForGame: false, status: "WAITING", symbolRange: "CONSONANT", rematch: false }; }
