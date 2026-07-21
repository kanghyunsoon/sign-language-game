import { describe, expect, it, vi } from "vitest";

import { StompBattleTransport, type StompClientLike, type StompSubscriptionLike } from "./StompBattleTransport";

class FakeStompClient implements StompClientLike {
  readonly subscriptions = new Map<string, (frame: { readonly body: string }) => void>();
  readonly send = vi.fn();
  connect(_headers: Readonly<Record<string, string>>, onConnect: () => void): void { onConnect(); }
  disconnect(callback?: () => void): void { callback?.(); }
  subscribe(destination: string, listener: (frame: { readonly body: string }) => void): StompSubscriptionLike {
    this.subscriptions.set(destination, listener);
    return { unsubscribe: () => this.subscriptions.delete(destination) };
  }
  emit(destination: string, payload: object): void { this.subscriptions.get(destination)?.({ body: JSON.stringify(payload) }); }
}

describe("StompBattleTransport", () => {
  it("subscribes to the player queue and then the authoritative match topic", async () => {
    const client = new FakeStompClient();
    const transport = new StompBattleTransport(() => client);
    const messages: string[] = [];
    transport.subscribe((message) => messages.push(message.type));
    await transport.connect({ url: "ws://localhost/ws/game", roomId: "room-1", playerId: "player-1" });

    expect(client.subscriptions.has("/queue/game/player/player-1")).toBe(true);
    client.emit("/queue/game/player/player-1", {
      type: "START_MATCH", sequence: 0, matchId: "match-1", roomId: "room-1",
      playerIds: ["player-1", "player-2"], startAt: Date.now(), matchVersion: "v1",
    });

    expect(messages).toEqual(["START_MATCH"]);
    expect(client.subscriptions.has("/topic/game/match/match-1")).toBe(true);
    transport.disconnect();
    expect(client.subscriptions.size).toBe(0);
  });
});
