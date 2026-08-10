import type { LineRaceBotConfig } from "./LineRaceBotConfig";
import { LINE_RACE_BOT_BALANCE } from "../core/LineRaceBalance";

export type LineRaceBotDifficulty = "EASY" | "NORMAL" | "HARD";

export function createLineRaceBotProfile(difficulty: LineRaceBotDifficulty, supportedSymbols: readonly string[], randomSeed = 12_345): LineRaceBotConfig {
  const profile = LINE_RACE_BOT_BALANCE[difficulty];
  return { botId: "PLAYER_B", displayName: `${difficulty} 연습 봇`, supportedSymbols: [...supportedSymbols], randomSeed,
    attackIntervalMinMs: profile.minAttackIntervalMs, attackIntervalMaxMs: profile.maxAttackIntervalMs,
    counterReactionMinMs: profile.minCounterReactionMs, counterReactionMaxMs: profile.maxCounterReactionMs,
    counterSuccessRate: profile.counterSuccessRate };
}
