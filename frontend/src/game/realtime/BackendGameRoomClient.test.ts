import { describe, expect, it, vi } from "vitest";
import { BackendGameRoomClient } from "./BackendGameRoomClient";

const room = {
  id: 7, roomCode: "ABC123", hostUserId: 42, guestUserId: null,
  hostReady: false, guestReady: false, status: "WAITING",
  participantCount: 1, capacity: 2,
};

describe("BackendGameRoomClient", () => {
  it("uses the deployed create and join contracts", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(room), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    });
    const client = new BackendGameRoomClient({
      apiBaseUrl: "/api", userId: "42", headers: { Authorization: "Bearer a" }, fetcher,
    });

    await client.create();
    await client.join(" abc123 ");

    expect(calls[0].url).toBe("/api/game-rooms?userId=42");
    expect(calls[0].init?.body).toBeUndefined();
    expect(calls[1].url).toBe("/api/game-rooms/join?userId=42");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ roomCode: "abc123" });
  });

  it("supports the announced gameType extension without requiring it before rollout", async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ init });
      return new Response(JSON.stringify({
        ...room, gameType: "OTTER_TURN_BATTLE",
      }), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    const client = new BackendGameRoomClient({
      apiBaseUrl: "/api", userId: "42", fetcher,
    });
    await expect(client.create("OTTER_TURN_BATTLE")).resolves.toMatchObject({
      id: 7, gameType: "OTTER_TURN_BATTLE",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      gameType: "OTTER_TURN_BATTLE",
    });
  });

  it("sends ready and start through their role-aware endpoints", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(room), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    });
    const client = new BackendGameRoomClient({ apiBaseUrl: "/api", userId: "42", fetcher });
    await client.ready(7, true);
    await client.start(7);
    expect(calls[0]?.url).toBe("/api/game-rooms/7/ready?userId=42");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ isReady: true });
    expect(calls[1]?.url).toBe("/api/game-rooms/7/start?userId=42");
  });
});
