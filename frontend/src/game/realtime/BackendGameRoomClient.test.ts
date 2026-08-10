import { describe, expect, it, vi } from "vitest";
import { BackendGameRoomClient } from "./BackendGameRoomClient";

const room = { id: 7, roomCode: "ABC123", hostUserId: 42, guestUserId: null, hostReady: false, guestReady: false, status: "WAITING", participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL", roomTitle: "자음 연습방", hostName: "수달왕", symbolRange: "CONSONANT", realtimeTicket: "room-ticket" };

describe("BackendGameRoomClient", () => {
  it("sends the room title and symbol range on create", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify(room), { status: 201, headers: { "Content-Type": "application/json" } });
    });
    const client = new BackendGameRoomClient({ apiBaseUrl: "/api", userId: "42", fetcher });
    const created = await client.create({ gameType: "TETRIS_DUEL", roomTitle: "자음 연습방", symbolRange: "CONSONANT" });
    expect(calls[0].url).toBe("/api/game-rooms?userId=42");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ gameType: "TETRIS_DUEL", roomTitle: "자음 연습방", symbolRange: "CONSONANT" });
    expect(created).toMatchObject({ roomTitle: "자음 연습방", hostName: "수달왕", symbolRange: "CONSONANT" });
  });

  it("keeps room metadata from join, ready, and start responses", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(room), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new BackendGameRoomClient({ apiBaseUrl: "/api", userId: "42", fetcher });
    await expect(client.join("ABC123")).resolves.toMatchObject({ roomTitle: "자음 연습방", hostName: "수달왕", symbolRange: "CONSONANT" });
    await expect(client.ready(7, true)).resolves.toMatchObject({ symbolRange: "CONSONANT" });
    await expect(client.start(7)).resolves.toMatchObject({ hostName: "수달왕" });
  });
});
