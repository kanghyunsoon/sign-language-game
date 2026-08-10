export type IncorrectComboPolicy = "RESET" | "DECREMENT";

export interface ScoringConfig {
  readonly normalRemovalScore: number;
  readonly comboIncrement: number;
  readonly incorrectComboPolicy: IncorrectComboPolicy;
  readonly noTargetPenalty: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  normalRemovalScore: 100,
  comboIncrement: 1,
  incorrectComboPolicy: "RESET",
  noTargetPenalty: 0,
};

export interface ScoreSnapshot {
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly removedCount: number;
}
