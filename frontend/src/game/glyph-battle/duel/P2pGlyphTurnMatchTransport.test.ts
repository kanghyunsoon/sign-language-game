import { describe, expect, it } from "vitest";

import type { GameDataChannel } from "../../media/core/GameDataChannel";
import { P2pGlyphTurnMatchTransport } from "./P2pGlyphTurnMatchTransport";
import type { GlyphTurnServerEvent } from "./GlyphTurnMatchContract";

describe("P2pGlyphTurnMatchTransport", () => {
  it("runs host and guest from the first turn through the finished snapshot", async () => {
    const [hostChannel, guestChannel] = pairedChannels("host", "guest");
    const host = new P2pGlyphTurnMatchTransport({ getChannel: () => hostChannel, localPlayerId: "host" });
    const guest = new P2pGlyphTurnMatchTransport({ getChannel: () => guestChannel, localPlayerId: "guest" });
    const hostEvents: GlyphTurnServerEvent[] = [];
    const guestEvents: GlyphTurnServerEvent[] = [];
    host.subscribe((event) => hostEvents.push(event));
    guest.subscribe((event) => guestEvents.push(event));
    const options = { url: "unused", roomId: "room-1", playerId: "host", matchId: "match-1", hostPlayerId: "host", playerIds: ["host", "guest"] } as const;

    await host.connect(options);
    await guest.connect({ ...options, playerId: "guest" });
    for (let turn = 1; turn <= 20 && !hostEvents.some((event) => event.type === "GLYPH_DUEL_SNAPSHOT" && event.phase === "FINISHED"); turn += 1) {
      guest.send({ type: "GLYPH_TURN_CHOICE_COMMAND", commandId: `guest-${turn}`, matchId: "match-1", turn, symbol: "guest", chosenAt: turn });
      host.send({ type: "GLYPH_TURN_CHOICE_COMMAND", commandId: `host-${turn}`, matchId: "match-1", turn, symbol: "host", chosenAt: turn });
    }

    const resolved = hostEvents.find((event) => event.type === "GLYPH_TURN_RESOLVED");
    expect(resolved).toMatchObject({ turn: 1, choices: [{ playerId: "host" }, { playerId: "guest" }] });
    expect(guestEvents.some((event) => event.type === "GLYPH_TURN_RESOLVED")).toBe(true);
    expect(hostEvents.some((event) => event.type === "GLYPH_DUEL_SNAPSHOT" && event.phase === "FINISHED")).toBe(true);
    expect(guestEvents.some((event) => event.type === "GLYPH_DUEL_SNAPSHOT" && event.phase === "FINISHED")).toBe(true);
    host.disconnect(); guest.disconnect();
  });
});

function pairedChannels(hostId: string, guestId: string): [GameDataChannel, GameDataChannel] {
  const hostListeners = new Set<(payload: string, remoteUserId: string) => void>();
  const guestListeners = new Set<(payload: string, remoteUserId: string) => void>();
  return [
    { isOpen: () => true, subscribe: (listener) => { hostListeners.add(listener); return () => hostListeners.delete(listener); }, send: (payload) => { for (const listener of guestListeners) listener(payload, hostId); } },
    { isOpen: () => true, subscribe: (listener) => { guestListeners.add(listener); return () => guestListeners.delete(listener); }, send: (payload) => { for (const listener of hostListeners) listener(payload, guestId); } },
  ];
}