import { describe, expect, it, vi } from "vitest";

import { BattleP2pAuthority } from "./BattleP2pAuthority";
import type { ServerBattleMessage } from "../transport/battleTransportTypes";

const hostId = "host-1";
const guestId = "guest-2";
const matchId = "match-3";
const roomId = "room-4";

function makeAuthority(overrides = {}): { authority: BattleP2pAuthority; events: ServerBattleMessage[] } {
  let counter = 0;
  const authority = new BattleP2pAuthority(matchId, roomId, [hostId, guestId], {
    now: () => 1_000,
    createId: () => `id-${++counter}`,
    countdownMs: 0,
    spawnIntervalMs: 1_800,
    ...overrides,
  });
  const events: ServerBattleMessage[] = [];
  authority.subscribe((event) => events.push(event));
  return { authority, events };
}

describe("BattleP2pAuthority", () => {
  it("emits MATCH_STARTED once with both players", () => {
    const { authority, events } = makeAuthority();
    authority.start();
    authority.ensureStarted(); // idempotent
    const started = events.filter((event) => event.type === "MATCH_STARTED");
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ matchId, roomId, playerIds: [hostId, guestId] });
    authority.dispose();
  });

  it("spawns letters for both players after the countdown", () => {
    vi.useFakeTimers();
    try {
      const { authority, events } = makeAuthority({ now: () => Date.now(), countdownMs: 100 });
      authority.start();
      vi.advanceTimersByTime(100);
      const spawns = events.filter((event) => event.type === "SPAWN_LETTER");
      expect(spawns.some((event) => "playerId" in event && event.playerId === hostId)).toBe(true);
      expect(spawns.some((event) => "playerId" in event && event.playerId === guestId)).toBe(true);
      authority.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts a removal with incremented score/combo and dedupes commandId", () => {
    const { authority, events } = makeAuthority();
    authority.start();
    authority.submit(hostId, { type: "REMOVE_LETTER_COMMAND", commandId: "c1", matchId, letterId: "L1", symbol: "ㄱ", occurredAt: 1 });
    authority.submit(hostId, { type: "REMOVE_LETTER_COMMAND", commandId: "c1", matchId, letterId: "L1", symbol: "ㄱ", occurredAt: 1 });
    const accepted = events.filter((event) => event.type === "REMOVE_LETTER_ACCEPTED");
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({ playerId: hostId, score: 100, combo: 1, maxCombo: 1, removedCount: 1 });
    authority.dispose();
  });

  it("creates an attack against the opponent every third combo", () => {
    const { authority, events } = makeAuthority();
    authority.start();
    for (let i = 1; i <= 3; i += 1) {
      authority.submit(hostId, { type: "REMOVE_LETTER_COMMAND", commandId: `c${i}`, matchId, letterId: `L${i}`, symbol: "ㄱ", occurredAt: i });
    }
    const attacks = events.filter((event) => event.type === "ATTACK_CREATED");
    expect(attacks).toHaveLength(1);
    expect(attacks[0]).toMatchObject({ attackerPlayerId: hostId, targetPlayerId: guestId, sourceCombo: 3 });
    authority.dispose();
  });

  it("finishes the match with the finish-line player as winner", () => {
    const { authority, events } = makeAuthority();
    authority.start();
    authority.submit(guestId, { type: "PLAYER_GAME_OVER_COMMAND", commandId: "g1", matchId, occurredAt: 1 });
    const finished = events.filter((event) => event.type === "MATCH_FINISHED");
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ winnerPlayerId: guestId, loserPlayerId: hostId, reason: "DANGER_LINE" });
    // No further events after finish.
    authority.submit(hostId, { type: "REMOVE_LETTER_COMMAND", commandId: "c9", matchId, letterId: "L9", symbol: "ㄱ", occurredAt: 2 });
    expect(events.filter((event) => event.type === "REMOVE_LETTER_ACCEPTED")).toHaveLength(0);
    authority.dispose();
  });
});
