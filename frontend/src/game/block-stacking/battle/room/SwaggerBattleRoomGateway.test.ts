import { describe, expect, it, vi } from "vitest";

import { SwaggerBattleRoomGateway } from "./SwaggerBattleRoomGateway";

describe("SwaggerBattleRoomGateway", () => {
  it("creates a TETRIS_DUEL room using the deployed Swagger request body", async () => {
    let requestInit: RequestInit | undefined;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init; return response(room()); });
    const gateway = createGateway(fetcher);
    const created = await gateway.createRoom({ title: "ignored", difficulty: "EASY", symbolRange: ["ㄱ"] });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/game-rooms?userId=1",
      expect.objectContaining({ method: "POST" }),
    );
    expect(requestInit?.body).toBe(JSON.stringify({ gameType: "TETRIS_DUEL" }));
    expect(created.roomId).toBe("10");
    expect(created.roomCode).toBe("ABC123");
  });

  it("joins with the Swagger roomCode body", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(room({ guestUserId: 2, participantCount: 2 })));
    const gateway = createGateway(fetcher);
    await gateway.joinRoom(" ABC123 ");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/game-rooms/join?userId=1",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ roomCode: "ABC123" }) }),
    );
  });

  it("uses the cached successful join when a repeated request receives 409", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response(room({ guestUserId: 2, participantCount: 2 })))
      .mockResolvedValueOnce(response(null, 409));
    const gateway = createGateway(fetcher);

    await gateway.joinRoom("ABC123");

    await expect(gateway.joinRoom("ABC123")).resolves.toMatchObject({ roomId: "10", roomCode: "ABC123" });
  });

  it("maps ready state and uses role-based room data", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(room({
      guestUserId: 2,
      participantCount: 2,
      hostReady: true,
      guestReady: true,
    })));
    const gateway = createGateway(fetcher);
    const ready = await gateway.setReady("10", true);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/game-rooms/10/ready?userId=1",
      expect.objectContaining({ body: JSON.stringify({ isReady: true }) }),
    );
    expect(ready.canStart).toBe(true);
    expect(ready.currentUserReady).toBe(true);
  });

  it("never calls a non-existent room detail endpoint", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(room()));
    const gateway = createGateway(fetcher);
    await expect(gateway.getRoom("10")).rejects.toThrow("상세 정보");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("mirrors the documented post-result WAITING state for a rematch", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response(room({
      guestUserId: 2,
      participantCount: 2,
      hostReady: true,
      guestReady: true,
      status: "IN_PROGRESS",
    })));
    const gateway = createGateway(fetcher);
    await gateway.startGame("10");

    await gateway.returnToWaiting("10");

    await expect(gateway.getRoom("10")).resolves.toMatchObject({
      status: "FULL",
      hostReady: false,
      guestReady: false,
      activeMatchId: null,
      canStart: false,
    });
  });
});

function createGateway(fetcher: ReturnType<typeof vi.fn>) {
  return new SwaggerBattleRoomGateway({
    baseUrl: "/api",
    currentUser: { userId: "1", displayName: "나" },
    headers: { Authorization: "Bearer token" },
    fetch: fetcher as unknown as typeof globalThis.fetch,
  });
}

function room(overrides: Partial<{
  guestUserId: number | null;
  participantCount: number;
  hostReady: boolean;
  guestReady: boolean;
  status: "WAITING" | "IN_PROGRESS";
}> = {}) {
  return {
    id: 10,
    roomCode: "ABC123",
    hostUserId: 1,
    guestUserId: null,
    hostReady: false,
    guestReady: false,
    status: "WAITING",
    participantCount: 1,
    capacity: 2,
    ...overrides,
  };
}

function response(value: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  } as Response;
}
