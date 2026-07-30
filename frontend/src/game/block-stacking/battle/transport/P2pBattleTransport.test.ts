import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { P2pBattleTransport } from "./P2pBattleTransport";
import type { ServerBattleMessage } from "./battleTransportTypes";

describe("P2pBattleTransport 1:1", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shares one target and drops it only for the first player who claims it", async () => {
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
    await vi.advanceTimersByTimeAsync(800);

    const hostTarget = hostEvents.find((event) => event.type === "SHARED_TARGET");
    const guestTarget = guestEvents.find((event) => event.type === "SHARED_TARGET");
    expect(hostTarget).toMatchObject(guestTarget ?? {});
    if (!guestTarget || guestTarget.type !== "SHARED_TARGET") throw new Error("shared target missing");

    guest.send({
      type: "CLAIM_SHARED_TARGET",
      commandId: "claim-1",
      matchId: "room-1",
      targetId: guestTarget.targetId,
      symbol: guestTarget.symbol,
      occurredAt: 1,
    });

    expect(guestEvents.find((event) => event.type === "SHARED_TARGET_CLAIMED")).toMatchObject({
      winnerPlayerId: "guest",
      symbol: guestTarget.symbol,
    });
    const spawns = guestEvents.filter((event) => event.type === "SPAWN_LETTER");
    expect(spawns).toHaveLength(1);
    expect(spawns[0]).toMatchObject({ playerId: "guest", symbol: guestTarget.symbol, normalizedX: 0.5 });
    const claimed = guestEvents.find((event) => event.type === "SHARED_TARGET_CLAIMED");
    if (!claimed || claimed.type !== "SHARED_TARGET_CLAIMED" || !spawns[0] || spawns[0].type !== "SPAWN_LETTER") throw new Error("claim sequence missing");
    expect(spawns[0].spawnAt - claimed.acceptedAt).toBe(1_150);

    host.send({
      type: "CLAIM_SHARED_TARGET",
      commandId: "claim-late",
      matchId: "room-1",
      targetId: guestTarget.targetId,
      symbol: guestTarget.symbol,
      occurredAt: 2,
    });
    expect(guestEvents.filter((event) => event.type === "SPAWN_LETTER")).toHaveLength(1);

    guest.send({ type: "PLAYER_GAME_OVER_COMMAND", commandId: "over-1", matchId: "room-1", occurredAt: 3 });
    expect(hostEvents.find((event) => event.type === "MATCH_FINISHED")).toMatchObject({ winnerPlayerId: "host", loserPlayerId: "guest" });
    expect(guestEvents.find((event) => event.type === "MATCH_FINISHED")).toMatchObject({ winnerPlayerId: "host", loserPlayerId: "guest" });
    host.disconnect();
    guest.disconnect();
  });

  it("awards an immediate win when a player forfeits", async () => {
    const [hostChannel, guestChannel] = pairedChannels("host", "guest");
    const host = new P2pBattleTransport(() => hostChannel, "host");
    const guest = new P2pBattleTransport(() => guestChannel, "guest");
    const hostEvents: ServerBattleMessage[] = [];
    host.subscribe((event) => hostEvents.push(event));
    const common = { url: "webrtc", roomId: "room-2", hostPlayerId: "host", playerIds: ["host", "guest"] } as const;
    await host.connect({ ...common, playerId: "host" });
    await guest.connect({ ...common, playerId: "guest" });
    guest.send({ type: "PLAYER_FORFEIT_COMMAND", commandId: "leave-1", matchId: "room-2", occurredAt: 3 });
    expect(hostEvents.find((event) => event.type === "MATCH_FINISHED")).toMatchObject({ winnerPlayerId: "host", loserPlayerId: "guest", reason: "FORFEIT" });
    host.disconnect();
    guest.disconnect();
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
