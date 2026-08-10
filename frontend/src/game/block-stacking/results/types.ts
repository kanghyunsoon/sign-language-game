import type { SymbolLearningStat } from "../../recognition/game/LearningStatistics";

export type PersistedGameMode = "KEYBOARD" | "PYTHON_AI";

export interface GameResultSubmission {
  readonly mode: PersistedGameMode;
  readonly score: number;
  readonly maxCombo: number;
  readonly removedCount: number;
  readonly durationSeconds: number;
  readonly playedAt: string;
  readonly symbolStatistics: readonly PersistedSymbolStatistic[];
}

export interface PersistedSymbolStatistic {
  readonly symbol: string;
  readonly targetCount: number;
  readonly confirmedCount: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly averageConfidence: number;
}

export interface StoredGameResult extends GameResultSubmission {
  readonly id: string;
}

export interface GameResultRepository {
  save(result: GameResultSubmission): Promise<StoredGameResult>;
  listMine(): Promise<readonly StoredGameResult[]>;
  getMyBest(): Promise<StoredGameResult | null>;
  getMySignStatistics(): Promise<readonly PersistedSymbolStatistic[]>;
}

export function toPersistedSymbolStatistics(statistics: readonly SymbolLearningStat[]): readonly PersistedSymbolStatistic[] {
  return statistics.map(({ symbol, targetCount, confirmedCount, correctCount, incorrectCount, averageConfidence }) => ({ symbol, targetCount, confirmedCount, correctCount, incorrectCount, averageConfidence }));
}
