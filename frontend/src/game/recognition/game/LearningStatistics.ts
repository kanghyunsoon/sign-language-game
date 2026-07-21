export interface SymbolLearningStat {
  readonly symbol: string;
  readonly targetCount: number;
  readonly confirmedCount: number;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly averageConfidence: number;
  readonly successRate: number;
}

interface MutableSymbolLearningStat {
  targetCount: number;
  confirmedCount: number;
  correctCount: number;
  incorrectCount: number;
  confidenceTotal: number;
}

export class LearningStatistics {
  private readonly bySymbol = new Map<string, MutableSymbolLearningStat>();

  recordTarget(symbol: string): void {
    this.forSymbol(symbol).targetCount += 1;
  }

  recordConfirmation(symbol: string, correct: boolean, confidence: number): void {
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new RangeError("Confidence must be a finite value between 0 and 1.");
    }
    const stat = this.forSymbol(symbol);
    stat.confirmedCount += 1;
    stat.confidenceTotal += confidence;
    if (correct) stat.correctCount += 1;
    else stat.incorrectCount += 1;
  }

  snapshot(): readonly SymbolLearningStat[] {
    return [...this.bySymbol.entries()]
      .map(([symbol, stat]) => ({
        symbol,
        targetCount: stat.targetCount,
        confirmedCount: stat.confirmedCount,
        correctCount: stat.correctCount,
        incorrectCount: stat.incorrectCount,
        averageConfidence: stat.confirmedCount === 0 ? 0 : stat.confidenceTotal / stat.confirmedCount,
        successRate: stat.confirmedCount === 0 ? 0 : stat.correctCount / stat.confirmedCount,
      }))
      .sort((left, right) => left.symbol.localeCompare(right.symbol));
  }

  clear(): void {
    this.bySymbol.clear();
  }

  private forSymbol(symbol: string): MutableSymbolLearningStat {
    const existing = this.bySymbol.get(symbol);
    if (existing) return existing;
    const created: MutableSymbolLearningStat = {
      targetCount: 0,
      confirmedCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      confidenceTotal: 0,
    };
    this.bySymbol.set(symbol, created);
    return created;
  }
}
