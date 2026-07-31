import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { BATTLE_IDLE_REMOVAL_EFFECT_MS, BATTLE_IDLE_REMOVAL_TIMEOUT_MS, P2pBattleTransport } from "./P2pBattleTransport";
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
    const targetCountAfterClaim = guestEvents.filter((event) => event.type === "SHARED_TARGET").length;
    await vi.advanceTimersByTimeAsync(1_149);
    expect(guestEvents.filter((event) => event.type === "SHARED_TARGET")).toHaveLength(targetCountAfterClaim);
    await vi.advanceTimersByTimeAsync(1);
    expect(guestEvents.filter((event) => event.type === "SHARED_TARGET")).toHaveLength(targetCountAfterClaim + 1);

    guest.send({ type: "PLAYER_GAME_OVER_COMMAND", commandId: "over-1", matchId: "room-1", occurredAt: 3 });
    expect(hostEvents.find((event) => event.type === "MATCH_FINISHED")).toMatchObject({ winnerPlayerId: "guest", loserPlayerId: "host" });
    expect(guestEvents.find((event) => event.type === "MATCH_FINISHED")).toMatchObject({ winnerPlayerId: "guest", loserPlayerId: "host" });
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

  it("returns a running match snapshot without restarting its countdown", async () => {
    const [hostChannel, guestChannel] = pairedChannels("host", "guest");
    const host = new P2pBattleTransport(() => hostChannel, "host");
    const guest = new P2pBattleTransport(() => guestChannel, "guest");
    const guestEvents: ServerBattleMessage[] = [];
    guest.subscribe((event) => guestEvents.push(event));
    const common = { url: "webrtc", roomId: "room-resume", hostPlayerId: "host", playerIds: ["host", "guest"] } as const;
    await host.connect({ ...common, playerId: "host" });
    await guest.connect({ ...common, playerId: "guest" });
    await vi.advanceTimersByTimeAsync(800);
    guestEvents.length = 0;

    guest.send({ type: "REQUEST_MATCH_STATE", commandId: "resume-1", matchId: "room-resume", occurredAt: 1 });

    expect(guestEvents.find((event) => event.type === "MATCH_STARTED")).toMatchObject({ resume: true, startAt: expect.any(Number) });
    host.disconnect();
    guest.disconnect();
  });

  it("preselects one block per board and removes both after shared inactivity", async () => {
    const [hostChannel, guestChannel] = pairedChannels("host", "guest");
    const host = new P2pBattleTransport(() => hostChannel, "host");
    const guest = new P2pBattleTransport(() => guestChannel, "guest");
    const hostEvents: ServerBattleMessage[] = [];
    const guestEvents: ServerBattleMessage[] = [];
    host.subscribe((event) => hostEvents.push(event));
    guest.subscribe((event) => guestEvents.push(event));
    const common = { url: "webrtc", roomId: "room-idle", hostPlayerId: "host", playerIds: ["host", "guest"] } as const;
    await host.connect({ ...common, playerId: "host" });
    await guest.connect({ ...common, playerId: "guest" });
    await vi.advanceTimersByTimeAsync(800);

    const firstTarget = guestEvents.find((event) => event.type === "SHARED_TARGET");
    if (!firstTarget || firstTarget.type !== "SHARED_TARGET") throw new Error("first target missing");
    host.send({ type: "CLAIM_SHARED_TARGET", commandId: "host-claim", matchId: "room-idle", targetId: firstTarget.targetId, symbol: firstTarget.symbol, occurredAt: Date.now() });
    const hostSpawn = guestEvents.find((event) => event.type === "SPAWN_LETTER" && event.playerId === "host");
    if (!hostSpawn || hostSpawn.type !== "SPAWN_LETTER") throw new Error("host spawn missing");

    await vi.advanceTimersByTimeAsync(1_150);
    const secondTarget = guestEvents.filter((event) => event.type === "SHARED_TARGET").at(-1);
    if (!secondTarget || secondTarget.type !== "SHARED_TARGET") throw new Error("second target missing");
    guest.send({ type: "CLAIM_SHARED_TARGET", commandId: "guest-claim", matchId: "room-idle", targetId: secondTarget.targetId, symbol: secondTarget.symbol, occurredAt: Date.now() });
    const guestSpawn = guestEvents.find((event) => event.type === "SPAWN_LETTER" && event.playerId === "guest");
    if (!guestSpawn || guestSpawn.type !== "SPAWN_LETTER") throw new Error("guest spawn missing");

    host.send({ type: "BOARD_SNAPSHOT", matchId: "room-idle", playerId: "host", sequence: 1, sentAt: Date.now(), bodies: [settledBody(hostSpawn.letterId, hostSpawn.symbol, .42, .78)] });
    guest.send({ type: "BOARD_SNAPSHOT", matchId: "room-idle", playerId: "guest", sequence: 1, sentAt: Date.now(), bodies: [settledBody(guestSpawn.letterId, guestSpawn.symbol, .58, .8)] });

    await vi.advanceTimersByTimeAsync(BATTLE_IDLE_REMOVAL_TIMEOUT_MS - 1);
    expect(guestEvents.some((event) => event.type === "IDLE_REMOVAL_SELECTED")).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const selected = guestEvents.find((event) => event.type === "IDLE_REMOVAL_SELECTED");
    expect(selected).toMatchObject({ targets: [
      { playerId: "host", letterId: hostSpawn.letterId, normalizedX: .42, normalizedY: .78 },
      { playerId: "guest", letterId: guestSpawn.letterId, normalizedX: .58, normalizedY: .8 },
    ] });
    expect(hostEvents.find((event) => event.type === "IDLE_REMOVAL_SELECTED")).toMatchObject(selected ?? {});

    await vi.advanceTimersByTimeAsync(BATTLE_IDLE_REMOVAL_EFFECT_MS - 1);
    expect(guestEvents.some((event) => event.type === "IDLE_REMOVAL_EXECUTED")).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(guestEvents.find((event) => event.type === "IDLE_REMOVAL_EXECUTED")).toMatchObject({ targets: [
      { playerId: "host", letterId: hostSpawn.letterId },
      { playerId: "guest", letterId: guestSpawn.letterId },
    ] });
    expect(hostEvents.find((event) => event.type === "IDLE_REMOVAL_EXECUTED")).toBeTruthy();
    host.disconnect();
    guest.disconnect();
  });

  it("publishes the host result-recorded acknowledgement to both peers", async () => {
    const [hostChannel, guestChannel] = pairedChannels("host", "guest");
    const host = new P2pBattleTransport(() => hostChannel, "host");
    const guest = new P2pBattleTransport(() => guestChannel, "guest");
    const hostEvents: ServerBattleMessage[] = [];
    const guestEvents: ServerBattleMessage[] = [];
    host.subscribe((event) => hostEvents.push(event));
    guest.subscribe((event) => guestEvents.push(event));
    const common = { url: "webrtc", roomId: "room-3", hostPlayerId: "host", playerIds: ["host", "guest"] } as const;
    await host.connect({ ...common, playerId: "host" });
    await guest.connect({ ...common, playerId: "guest" });
    host.send({ type: "RESULT_RECORDED_COMMAND", commandId: "result-1", matchId: "room-3", recordedAt: 100 });
    expect(hostEvents.find((event) => event.type === "RESULT_RECORDED")).toMatchObject({ matchId: "room-3", recordedAt: 100 });
    expect(guestEvents.find((event) => event.type === "RESULT_RECORDED")).toMatchObject({ matchId: "room-3", recordedAt: 100 });
    host.disconnect();
    guest.disconnect();
  });

  it("relays owner transform batches to the opponent", async () => {
    const [hostChannel, guestChannel] = pairedChannels("host", "guest");
    const host = new P2pBattleTransport(() => hostChannel, "host");
    const guest = new P2pBattleTransport(() => guestChannel, "guest");
    const hostEvents: ServerBattleMessage[] = [];
    const guestEvents: ServerBattleMessage[] = [];
    host.subscribe((event) => hostEvents.push(event));
    guest.subscribe((event) => guestEvents.push(event));
    const common = { url: "webrtc", roomId: "room-sync", hostPlayerId: "host", playerIds: ["host", "guest"] } as const;
    await host.connect({ ...common, playerId: "host" });
    await guest.connect({ ...common, playerId: "guest" });

    const guestBody = settledBody("guest-letter", "ㄱ", .5, .3);
    guest.send({ type: "BODY_TRANSFORM_BATCH", matchId: "room-sync", playerId: "guest", sequence: 1, sentAt: 100, bodies: [{ ...guestBody, state: "FALLING" }] });
    const hostBody = settledBody("host-letter", "ㄴ", .5, .4);
    host.send({ type: "BODY_TRANSFORM_BATCH", matchId: "room-sync", playerId: "host", sequence: 1, sentAt: 110, bodies: [{ ...hostBody, state: "FALLING" }] });

    expect(hostEvents).toContainEqual(expect.objectContaining({ type: "BODY_TRANSFORM_BATCH", playerId: "guest", bodies: [expect.objectContaining({ id: "guest-letter" })] }));
    expect(guestEvents).toContainEqual(expect.objectContaining({ type: "BODY_TRANSFORM_BATCH", playerId: "host", bodies: [expect.objectContaining({ id: "host-letter" })] }));
    host.disconnect();
    guest.disconnect();
  });
});

function settledBody(id: string, symbol: string, x: number, y: number) {
  return { id, symbol, x, y, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, state: "SETTLED" as const };
}

function pairedChannels(hostId: string, guestId: string): [GameDataChannel, GameDataChannel] {
  const hostListeners = new Set<(payload: string, remoteUserId: string) => void>();
  const guestListeners = new Set<(payload: string, remoteUserId: string) => void>();
  return [
    { isOpen: () => true, subscribe: (listener) => { hostListeners.add(listener); return () => hostListeners.delete(listener); }, send: (payload) => { for (const listener of guestListeners) listener(payload, hostId); } },
    { isOpen: () => true, subscribe: (listener) => { guestListeners.add(listener); return () => guestListeners.delete(listener); }, send: (payload) => { for (const listener of hostListeners) listener(payload, guestId); } },
  ];
}
