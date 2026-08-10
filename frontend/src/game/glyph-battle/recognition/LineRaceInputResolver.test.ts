import { describe, expect, it } from "vitest";
import { DefaultLineRaceInputResolver } from "./LineRaceInputResolver";
import type { LineRaceInputContext } from "./LineRaceInputContext";

const resolver = new DefaultLineRaceInputResolver();
const base: LineRaceInputContext = {
  matchState: "PLAYING", attackHand: ["ㄱ", "ㄴ", "ㅁ"], attackCooldownEndsAt: 0, now: 1_000,
  pendingObstacleCount: 0, maxPendingObstacles: 6, supportedSymbols: ["ㄱ", "ㄴ", "ㅁ", "ㅋ"], counterableObstacles: [],
};

describe("DefaultLineRaceInputResolver", () => {
  it("attacks only with a supported card while playing", () => {
    expect(resolver.resolveConfirmedSymbol("ㄱ", base)).toEqual({ type: "ATTACK", symbol: "ㄱ" });
    expect(resolver.resolveConfirmedSymbol("ㅋ", base)).toMatchObject({ type: "INVALID", reason: "SYMBOL_NOT_IN_HAND" });
    expect(resolver.resolveConfirmedSymbol("ㅎ", base)).toMatchObject({ type: "INVALID", reason: "NO_AVAILABLE_ACTION" });
    expect(resolver.resolveConfirmedSymbol("ㄱ", { ...base, matchState: "COUNTDOWN" })).toMatchObject({ type: "INVALID", reason: "MATCH_NOT_PLAYING" });
  });

  it("rejects a recognition-excluded symbol even when a malformed context contains it", () => {
    const malformed = { ...base, attackHand: ["ㄱ", "ㅏ", "ㅁ"], supportedSymbols: ["ㄱ", "ㅏ", "ㅁ"] };
    expect(resolver.resolveConfirmedSymbol("ㅏ", malformed)).toMatchObject({ type: "INVALID", reason: "NO_AVAILABLE_ACTION" });
  });

  it("prioritizes the nearest matching counter even during attack cooldown", () => {
    const context: LineRaceInputContext = { ...base, attackCooldownEndsAt: 2_000, counterableObstacles: [
      { obstacleId: "far", symbol: "ㄱ", distanceToRunner: 80, counterDeadlineAt: 1_500, state: "ACTIVE" },
      { obstacleId: "near", symbol: "ㄱ", distanceToRunner: 20, counterDeadlineAt: 1_400, state: "FALLING" },
    ] };
    expect(resolver.resolveConfirmedSymbol("ㄱ", context)).toEqual({ type: "COUNTER", obstacleId: "near", symbol: "ㄱ" });
  });

  it("ignores an expired counter and enforces cooldown and pending limit", () => {
    const expired = { obstacleId: "old", symbol: "ㄱ", distanceToRunner: 1, counterDeadlineAt: 999, state: "WARNING" as const };
    expect(resolver.resolveConfirmedSymbol("ㄱ", { ...base, attackCooldownEndsAt: 2_000, counterableObstacles: [expired] })).toMatchObject({ type: "INVALID", reason: "ATTACK_COOLDOWN" });
    expect(resolver.resolveConfirmedSymbol("ㄱ", { ...base, pendingObstacleCount: 6 })).toMatchObject({ type: "INVALID", reason: "NO_AVAILABLE_ACTION" });
  });
});
