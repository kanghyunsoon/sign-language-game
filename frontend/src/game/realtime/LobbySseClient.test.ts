import { describe, expect, it, vi } from "vitest";
import { LobbySseClient, parseLobbyRooms, type EventSourceLike } from "./LobbySseClient";

class FakeEventSource implements EventSourceLike {
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void { this.listeners.set(type, listener); }
  emit(type: string, value: unknown): void { this.listeners.get(type)?.({ data: JSON.stringify(value) } as MessageEvent<string>); }
}

const lobbyRoom = { id: 1, roomCode: "ABC123", status: "WAITING", participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL", title: "모음 연습방", hostName: "수달왕", symbolRange: "VOWEL" };

describe("LobbySseClient", () => {
  it("uses the ticket and treats SSE metadata as room-list data", async () => {
    const source = new FakeEventSource(); const events: unknown[] = [];
    const client = new LobbySseClient({ apiBaseUrl: "/api/", ticketClient: { issue: vi.fn(async () => ({ ticket: "sse ticket", expiresInSeconds: 30 })) }, createEventSource: vi.fn(() => source) });
    client.subscribe((event) => events.push(event));
    await client.connect(); source.emit("snapshot", { rooms: [lobbyRoom] });
    expect(events).toEqual([{ type: "snapshot", rooms: [lobbyRoom] }]);
  });

  it("parses the delegated host and range from the latest SSE payload", () => {
    expect(parseLobbyRooms({ rooms: [{ ...lobbyRoom, hostName: "새 방장", symbolRange: "ALL" }] })).toEqual([{ ...lobbyRoom, hostName: "새 방장", symbolRange: "ALL" }]);
  });
});
