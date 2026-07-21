import { DEFAULT_SCORING_CONFIG, type ScoreSnapshot, type ScoringConfig } from "./types";

export class ScoreTracker {
  private score = 0;
  private combo = 0;
  private bestCombo = 0;
  private removedCount = 0;

  constructor(private readonly config: ScoringConfig = DEFAULT_SCORING_CONFIG) {}

  recordRemoval(): ScoreSnapshot {
    this.combo += this.config.comboIncrement;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.score += this.config.normalRemovalScore * this.combo;
    this.removedCount += 1;
    return this.snapshot();
  }

  recordIncorrect(): ScoreSnapshot {
    this.combo = this.config.incorrectComboPolicy === "RESET"
      ? 0
      : Math.max(0, this.combo - 1);
    return this.snapshot();
  }

  recordNoTarget(): ScoreSnapshot {
    this.score = Math.max(0, this.score - this.config.noTargetPenalty);
    return this.snapshot();
  }

  snapshot(): ScoreSnapshot {
    return { score: this.score, combo: this.combo, bestCombo: this.bestCombo, removedCount: this.removedCount };
  }
}
