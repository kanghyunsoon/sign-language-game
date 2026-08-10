export interface SignCandidateSample {
  readonly symbol: string;
  readonly confidence: number;
  readonly predictedAt: number;
  readonly sequence: number;
}

export interface SignCandidateSummary {
  readonly symbol: string;
  readonly votes: number;
  readonly averageConfidence: number;
  readonly firstPredictedAt: number;
}

export class SignCandidateWindow {
  private samples: SignCandidateSample[] = [];
  constructor(private size: number) {}

  add(sample: SignCandidateSample): SignCandidateSummary {
    this.samples.push(sample);
    if (this.samples.length > this.size) this.samples.splice(0, this.samples.length - this.size);
    return this.getSummary()!;
  }

  resize(size: number): void {
    this.size = size;
    if (this.samples.length > size) this.samples.splice(0, this.samples.length - size);
  }

  getSummary(): SignCandidateSummary | undefined {
    if (this.samples.length === 0) return undefined;
    const grouped = new Map<string, SignCandidateSample[]>();
    this.samples.forEach((sample) => grouped.set(sample.symbol, [...(grouped.get(sample.symbol) ?? []), sample]));
    const [symbol, matches] = [...grouped.entries()].sort((left, right) => {
      if (right[1].length !== left[1].length) return right[1].length - left[1].length;
      return right[1][right[1].length - 1]!.sequence - left[1][left[1].length - 1]!.sequence;
    })[0]!;
    return {
      symbol,
      votes: matches.length,
      averageConfidence: matches.reduce((sum, item) => sum + item.confidence, 0) / matches.length,
      firstPredictedAt: matches[0]!.predictedAt,
    };
  }

  clear(): void { this.samples = []; }
  getSamples(): readonly SignCandidateSample[] { return this.samples; }
}
