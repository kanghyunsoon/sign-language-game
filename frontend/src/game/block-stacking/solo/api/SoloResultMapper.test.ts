import { describe, expect, it } from "vitest";

import type { SymbolLearningStat } from "../../../recognition/game/LearningStatistics";
import type { GameRuntimeSnapshot } from "../../runtime/types";
import { toCompleteSoloSessionRequest, toSoloSymbolStatistics } from "./SoloResultMapper";

const snapshot: GameRuntimeSnapshot = {
  runState: "GAME_OVER",
  score: 250,
  combo: 0,
  bestCombo: 4,
  removedCount: 3,
  playTimeMs: 12_345.4,
  activeLetterCount: 5,
  lockedSymbol: null,
  queuedSymbol: null,
  paperBurstVersion: 0,
  paperBurstSymbol: null,
  lastMessage: "done",
};
const statistics: readonly SymbolLearningStat[] = [{ symbol: "ㄱ", targetCount: 4, confirmedCount: 3, correctCount: 3, incorrectCount: 0, averageConfidence: 0.91, successRate: 1 }];

describe("SoloResultMapper", () => {
  it("maps runtime result fields using milliseconds", () => {
    expect(toCompleteSoloSessionRequest(snapshot, statistics, 20_000)).toEqual({
      finalScore: 250,
      maxCombo: 4,
      removedSymbolCount: 3,
      playDurationMs: 12_345,
      symbolStatistics: [{ symbol: "ㄱ", confirmedCount: 3, correctCount: 3, incorrectCount: 0 }],
      endedAt: 20_000,
    });
  });

  it("omits target counts, confidence, video, and landmark data", () => {
    const mapped = toSoloSymbolStatistics(statistics)[0];

    expect(mapped).not.toHaveProperty("targetCount");
    expect(mapped).not.toHaveProperty("averageConfidence");
    expect(mapped).not.toHaveProperty("landmarks");
  });
});
