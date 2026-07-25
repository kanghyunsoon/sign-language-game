import { describe, expect, it } from "vitest";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";
import { interpolateTraversalRecovery, RaceLaneRenderer, resolveLaneHostRole, resolveRunnerMotionCue } from "./RaceLaneRenderer";
import { resolveDuelHealthColors } from "./GlyphDuelHudRenderer";

describe("interpolateTraversalRecovery", () => {
  const from = { x: 420, y: 90, rotation: .1 };
  const target = { x: 300, y: 170, rotation: 0 };

  it("starts at the last traversal coordinate without teleporting", () => {
    expect(interpolateTraversalRecovery(from, target, 0)).toEqual(from);
  });

  it("returns smoothly and lands on the normal race coordinate", () => {
    const halfway = interpolateTraversalRecovery(from, target, 360);
    expect(halfway.x).toBeLessThan(from.x);
    expect(halfway.x).toBeGreaterThan(target.x);
    expect(halfway.y).toBeGreaterThan(from.y);
    expect(halfway.y).toBeLessThan(target.y);
    expect(interpolateTraversalRecovery(from, target, 720)).toEqual(target);
  });
});

describe("RaceLaneRenderer server-state visibility", () => {
  it("hides a previously rendered runner when the authoritative snapshot has no players", () => {
    const lane = new RaceLaneRenderer("PLAYER_A");
    lane.resize(900, 150);
    lane.render({
      state: "PLAYING",
      now: 1_000,
      simulationNow: 1_000,
      remainingMs: 59_000,
      players: [{ playerId: "PLAYER_A", displayName: "나", progress: 10, state: "RUNNING", accumulatedPenaltyMs: 0 }],
      obstacles: [],
    }, 1_000);
    expect(lane.root.visible).toBe(true);

    lane.render({
      state: "IDLE",
      now: 1_100,
      simulationNow: 1_000,
      remainingMs: 0,
      players: [],
      obstacles: [],
    }, 1_000);
    expect(lane.root.visible).toBe(false);
  });
});

describe("resolveRunnerMotionCue", () => {
  const view: GlyphDuelView = {
    local: { playerId: "me", health: 100, focus: 0, guardPercent: 0, rounds: 0 },
    opponent: { playerId: "rival", health: 100, focus: 0, guardPercent: 0, rounds: 0 },
    phase: "REVEAL", turn: 2, prompt: "", callout: "", calloutAt: 1_000, revision: 1,
    lastMove: { symbol: "ㄱ", role: "ATTACK", roleLabel: "공격", elementLabel: "획", label: "획 베기", damage: 12, attackerId: "me", targetId: "rival" },
  };

  it("gives attacker and target different animations during reveal", () => {
    expect(resolveRunnerMotionCue("PLAYER_A", view, 1_250)).toEqual({ motion: "ATTACK", ageMs: 250 });
    expect(resolveRunnerMotionCue("PLAYER_B", view, 1_250)).toEqual({ motion: "IDLE", ageMs: 250 });
    expect(resolveRunnerMotionCue("PLAYER_B", view, 1_530)).toEqual({ motion: "HIT", ageMs: 50 });
  });

  it("shows a locked pose without revealing the selected role", () => {
    const waiting = { ...view, phase: "WAITING" as const, lastMove: null };
    expect(resolveRunnerMotionCue("PLAYER_A", waiting, 1_300).motion).toBe("LOCKED");
    expect(resolveRunnerMotionCue("PLAYER_B", waiting, 1_300).motion).toBe("IDLE");
  });
});
describe("online duel role mapping", () => {
  const challengerView: GlyphDuelView = {
    hostPlayerId: "host",
    local: { playerId: "guest", health: 100, focus: 0, guardPercent: 0, rounds: 0 },
    opponent: { playerId: "host", health: 100, focus: 0, guardPercent: 0, rounds: 0 },
    phase: "PLANNING", turn: 1, prompt: "", lastMove: null, callout: "", calloutAt: 0, revision: 0,
  };

  it("keeps the challenger on the left but assigns the challenger asset and orange HP", () => {
    expect(resolveLaneHostRole("PLAYER_A", challengerView)).toBe(false);
    expect(resolveLaneHostRole("PLAYER_B", challengerView)).toBe(true);
    expect(resolveDuelHealthColors(challengerView)).toEqual({ left: 0xff724a, right: 0x26c6ff });
  });
});