import type { SymbolLearningStat } from "../../../recognition/game/LearningStatistics";
import type { GameRuntimeSnapshot } from "../../runtime/types";
import type { CompleteSoloSessionRequest, SoloSymbolStatistic } from "./SoloGameApi";

export function toSoloSymbolStatistics(statistics: readonly SymbolLearningStat[]): readonly SoloSymbolStatistic[] {
  return statistics.map(({ symbol, correctCount, incorrectCount, confirmedCount }) => ({
    symbol,
    correctCount,
    incorrectCount,
    confirmedCount,
  }));
}

export function toCompleteSoloSessionRequest(
  snapshot: GameRuntimeSnapshot,
  statistics: readonly SymbolLearningStat[],
  endedAt: number,
): CompleteSoloSessionRequest {
  return {
    finalScore: toElapsedScoreSeconds(snapshot.playTimeMs),
    maxCombo: snapshot.bestCombo,
    removedSymbolCount: snapshot.removedCount,
    playDurationMs: Math.max(0, Math.round(snapshot.playTimeMs)),
    symbolStatistics: toSoloSymbolStatistics(statistics),
    endedAt,
  };
}

export function toElapsedScoreSeconds(playTimeMs: number): number {
  return Math.max(0, Math.ceil(playTimeMs / 1_000));
}
