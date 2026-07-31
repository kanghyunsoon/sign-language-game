import { describe, expect, it, vi } from "vitest";
import { LobbySseClient, type EventSourceLike } from "./LobbySseClient";

class FakeEventSource implements EventSourceLike {
  readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();
  onerror: ((event: Event) => void) | null = null;
  close = vi.fn();
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    this.listeners.set(type, listener);
  }
  emit(type: string, value: unknown): void {
    this.listeners.get(type)?.({ data: JSON.stringify(value) } as MessageEvent<string>);
  }
}

describe("LobbySseClient", () => {
  it("uses a one-use query ticket and parses snapshot/update events", async () => {
    const source = new FakeEventSource();
    const events: unknown[] = [];
    const createEventSource = vi.fn(() => source);
    const client = new LobbySseClient({
      apiBaseUrl: "/api/",
      ticketClient: { issue: vi.fn(async () => ({ ticket: "sse ticket", expiresInSeconds: 30 })) },
      createEventSource,
    });
    client.subscribe((event) => events.push(event));

    await client.connect();
    source.emit("snapshot", { rooms: [{
      id: 1, roomCode: "ABC123", status: "WAITING",
      participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL",
    }] });

    expect(createEventSource).toHaveBeenCalledWith("/api/game-rooms/subscribe?ticket=sse%20ticket");
    expect(events).toEqual([{
      type: "snapshot",
      rooms: [{
        id: 1, roomCode: "ABC123", status: "WAITING",
        participantCount: 1, capacity: 2, gameType: "TETRIS_DUEL",
      }],
    }]);
  });

  it("closes on error so reconnect can issue a different ticket", async () => {
    const source = new FakeEventSource();
    const client = new LobbySseClient({ apiBaseUrl: "/api", ticketClient: { issue: async () => ({ ticket: "a", expiresInSeconds: 30 }) }, createEventSource: () => source });
    await client.connect();
    source.onerror?.(new Event("error"));
    expect(source.close).toHaveBeenCalled();
  });
});
