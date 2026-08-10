import { describe, expect, it } from "vitest";
import { createLineRaceBotProfile } from "../bot";
import { JAMO_OBSTACLE_BALANCE } from "../obstacle";
import { LINE_RACE_BOT_BALANCE, LINE_RACE_MATCH_BALANCE } from "./LineRaceBalance";
import { DEFAULT_LINE_RACE_RUNTIME_CONFIG } from "./LineRaceRuntimeConfig";

describe("line-race canonical balance mirror", () => {
  it("drives every frontend runtime match default", () => {
    expect(DEFAULT_LINE_RACE_RUNTIME_CONFIG).toEqual({
      raceLength: LINE_RACE_MATCH_BALANCE.raceLength,
      baseSpeedPerSecond: LINE_RACE_MATCH_BALANCE.baseSpeedPerSecond,
      matchDurationMs: LINE_RACE_MATCH_BALANCE.matchDurationMs,
      countdownMs: LINE_RACE_MATCH_BALANCE.countdownMs,
    });
    expect(JAMO_OBSTACLE_BALANCE).toMatchObject({
      warningDurationMs: LINE_RACE_MATCH_BALANCE.warningDurationMs,
      obstacleLeadDistance: LINE_RACE_MATCH_BALANCE.obstacleLeadDistance,
      minimumObstacleSpacing: LINE_RACE_MATCH_BALANCE.minimumObstacleSpacing,
    });
  });

  it.each(["EASY", "NORMAL", "HARD"] as const)("drives the %s local Bot profile", (difficulty) => {
    const expected = LINE_RACE_BOT_BALANCE[difficulty];
    expect(createLineRaceBotProfile(difficulty, ["ㄱ"], 7)).toMatchObject({
      attackIntervalMinMs: expected.minAttackIntervalMs, attackIntervalMaxMs: expected.maxAttackIntervalMs,
      counterReactionMinMs: expected.minCounterReactionMs, counterReactionMaxMs: expected.maxCounterReactionMs,
      counterSuccessRate: expected.counterSuccessRate,
    });
  });
});
