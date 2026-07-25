import { describe, expect, it } from "vitest";
import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { P2pBattleTransport } from "./P2pBattleTransport";
import type { ServerBattleMessage } from "./battleTransportTypes";

describe("P2pBattleTransport 1:1", () => {
  it("runs host/guest from match start to authoritative finish", async () => {
    const [hostChannel, guestChannel] = pairedChannels("host", "guest");
    const host = new P2pBattleTransport(() => hostChannel, "host");
    const guest = new P2pBattleTransport(() => guestChannel, "guest");
    const hostEvents: ServerBattleMessage[] = [];
    const guestEvents: ServerBattleMessage[] = [];
    host.subscribe((event) => hostEvents.push(event));
    guest.subscribe((event) => guestEvents.push(event));
    const common = { url: "webrtc", roomId: "room-1", hostPlayerId: "host", playerIds: ["host", "guest"] } as const;
    await host.connect({ ...common, playerId: "host" });
    await guest.connect({ ...common, playerId: "guest" });

    expect(guestEvents.some((event) => event.type === "MATCH_STARTED")).toBe(true);
    const spawn = guestEvents.find((event) => event.type === "SPAWN_LETTER" && event.playerId === "guest");
    expect(spawn?.type).toBe("SPAWN_LETTER");
    if (!spawn || spawn.type !== "SPAWN_LETTER") throw new Error("spawn missing");
    guest.send({ type: "REMOVE_LETTER_COMMAND", commandId: "remove-1", matchId: "room-1", letterId: spawn.letterId, symbol: spawn.symbol, occurredAt: 1 });
    expect(guestEvents.some((event) => event.type === "REMOVE_LETTER_ACCEPTED" && event.playerId === "guest")).toBe(true);
    guest.send({ type: "PLAYER_GAME_OVER_COMMAND", commandId: "over-1", matchId: "room-1", occurredAt: 2 });
    expect(hostEvents.find((event) => event.type === "MATCH_FINISHED")).toMatchObject({ winnerPlayerId: "host", loserPlayerId: "guest" });
    expect(guestEvents.find((event) => event.type === "MATCH_FINISHED")).toMatchObject({ winnerPlayerId: "host", loserPlayerId: "guest" });
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