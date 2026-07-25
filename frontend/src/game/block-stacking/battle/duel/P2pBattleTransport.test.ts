import { describe, expect, it } from "vitest";

import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { P2pBattleTransport } from "./P2pBattleTransport";
import type { ServerBattleMessage } from "../transport/battleTransportTypes";

const hostId = "host-1";
const guestId = "guest-2";
const roomId = "room-9";

const noTimers = { setTimer: () => 0 as unknown as ReturnType<typeof setTimeout>, clearTimer: () => {} };
const authorityOptions = { countdownMs: 0, now: () => 1_000, createId: () => "attack-id", ...noTimers };

function pairedChannels(): readonly [FakeChannel, FakeChannel] {
  const host = new FakeChannel(hostId);
  const guest = new FakeChannel(guestId);
  host.peer = guest;
  guest.peer = host;
  return [host, guest];
}

class FakeChannel implements GameDataChannel {
  peer: FakeChannel | null = null;
  private readonly listeners = new Set<(payload: string, remoteUserId: string) => void>();
  constructor(private readonly localUserId: string) {}
  send(payload: string): void { this.peer?.receive(payload, this.localUserId); }
  subscribe(listener: (payload: string, remoteUserId: string) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  isOpen(): boolean { return true; }
  private receive(payload: string, remoteUserId: string): void { for (const listener of this.listeners) listener(payload, remoteUserId); }
}

async function connectedPair(): Promise<{ host: P2pBattleTransport; guest: P2pBattleTransport; hostEvents: ServerBattleMessage[]; guestEvents: ServerBattleMessage[] }> {
  const [hostChannel, guestChannel] = pairedChannels();
  const host = new P2pBattleTransport({ localPlayerId: hostId, hostUserId: hostId, playerIds: [hostId, guestId], getChannel: () => hostChannel, matchId: roomId, authorityOptions, ...noTimers });
  const guest = new P2pBattleTransport({ localPlayerId: guestId, hostUserId: hostId, playerIds: [hostId, guestId], getChannel: () => guestChannel, matchId: roomId, ...noTimers });
  const hostEvents: ServerBattleMessage[] = [];
  const guestEvents: ServerBattleMessage[] = [];
  host.subscribe((event) => hostEvents.push(event));
  guest.subscribe((event) => guestEvents.push(event));
  await host.connect({ url: "webrtc-datachannel", roomId, playerId: hostId });
  await guest.connect({ url: "webrtc-datachannel", roomId, playerId: guestId });
  return { host, guest, hostEvents, guestEvents };
}

describe("P2pBattleTransport", () => {
  it("starts the match on the host and delivers MATCH_STARTED to the guest", async () => {
    const { host, guest, hostEvents, guestEvents } = await connectedPair();
    guest.send({ type: "REQUEST_MATCH_STATE", commandId: "r1", matchId: roomId, occurredAt: 1 });
    expect(hostEvents.some((event) => event.type === "MATCH_STARTED")).toBe(true);
    expect(guestEvents.some((event) => event.type === "MATCH_STARTED")).toBe(true);
    expect(host.getConnectionState()).toBe("CONNECTED");
    expect(guest.getConnectionState()).toBe("CONNECTED");
  });

  it("adjudicates a guest removal on the host and echoes the result to the guest", async () => {
    const { guest, guestEvents } = await connectedPair();
    guest.send({ type: "REQUEST_MATCH_STATE", commandId: "r1", matchId: roomId, occurredAt: 1 });
    guest.send({ type: "REMOVE_LETTER_COMMAND", commandId: "c1", matchId: roomId, letterId: "L1", symbol: "ㄱ", occurredAt: 2 });
    const accepted = guestEvents.filter((event) => event.type === "REMOVE_LETTER_ACCEPTED");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ playerId: guestId, score: 100, combo: 1 });
  });

  it("relays each side's board batch to the opponent only", async () => {
    const { host, guest, hostEvents, guestEvents } = await connectedPair();
    // Guest publishes its board -> host should see it (host's remote-board mirror).
    guest.send({ type: "BODY_TRANSFORM_BATCH", matchId: roomId, playerId: guestId, sequence: 1, sentAt: 1, bodies: [] });
    // Host publishes its board -> guest should see it.
    host.send({ type: "BODY_TRANSFORM_BATCH", matchId: roomId, playerId: hostId, sequence: 2, sentAt: 2, bodies: [] });
    const guestBatchOnHost = hostEvents.filter((event) => event.type === "BODY_TRANSFORM_BATCH" && "playerId" in event && event.playerId === guestId);
    const hostBatchOnGuest = guestEvents.filter((event) => event.type === "BODY_TRANSFORM_BATCH" && "playerId" in event && event.playerId === hostId);
    expect(guestBatchOnHost).toHaveLength(1);
    expect(hostBatchOnGuest).toHaveLength(1);
    // A side never receives its own board batch echoed back.
    expect(hostEvents.some((event) => event.type === "BODY_TRANSFORM_BATCH" && "playerId" in event && event.playerId === hostId)).toBe(false);
    expect(guestEvents.some((event) => event.type === "BODY_TRANSFORM_BATCH" && "playerId" in event && event.playerId === guestId)).toBe(false);
  });
});
