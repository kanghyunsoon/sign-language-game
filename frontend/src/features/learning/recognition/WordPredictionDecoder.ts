export interface WordPredictionDecoderConfig {
  readonly minimumConfidence: number;
  readonly candidateWindowSize: number;
  readonly minimumCandidateVotes: number;
  readonly noHandReleaseDurationMs: number;
  readonly differentSymbolReleaseVotes: number;
}

export const WORD_PREDICTION_DECODER_CONFIG: WordPredictionDecoderConfig = {
  minimumConfidence: 0.55,
  candidateWindowSize: 8,
  minimumCandidateVotes: 6,
  noHandReleaseDurationMs: 250,
  differentSymbolReleaseVotes: 2,
};

export type WordDecoderEvent =
  | {
      readonly type: "SIGN_CONFIRMED";
      readonly symbol: string;
      readonly confidence: number;
      readonly occurredAt: number;
    }
  | {
      readonly type: "HAND_RELEASED";
      readonly occurredAt: number;
    };

interface WordPrediction {
  readonly symbol: string;
  readonly confidence: number;
  readonly predictedAt: number;
}

type WordDecoderListener = (event: WordDecoderEvent) => void;

export class WordPredictionDecoder {
  private readonly listeners = new Set<WordDecoderListener>();
  private readonly config: WordPredictionDecoderConfig;
  private confidenceBySymbol: Readonly<Record<string, number>> = {};
  private candidates: WordPrediction[] = [];
  private confirmedSymbol: string | null = null;
  private differentSymbolVotes = 0;
  private noHandStartedAt: number | null = null;

  constructor(
    config: Partial<WordPredictionDecoderConfig> = {},
  ) {
    this.config = { ...WORD_PREDICTION_DECODER_CONFIG, ...config };
  }

  subscribe(listener: WordDecoderListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setConfidenceThresholds(
    thresholds: Readonly<Record<string, number>> | undefined,
  ): void {
    this.confidenceBySymbol = thresholds ?? {};
  }

  pushPrediction(prediction: WordPrediction): void {
    this.noHandStartedAt = null;

    if (this.confirmedSymbol) {
      if (prediction.symbol !== this.confirmedSymbol) {
        this.differentSymbolVotes += 1;
        if (
          this.differentSymbolVotes >=
          this.config.differentSymbolReleaseVotes
        ) {
          this.release(prediction.predictedAt);
        }
      } else {
        this.differentSymbolVotes = 0;
      }
      return;
    }

    const threshold =
      this.confidenceBySymbol[prediction.symbol] ??
      this.config.minimumConfidence;
    if (prediction.confidence < threshold) {
      return;
    }

    this.candidates = [...this.candidates, prediction].slice(
      -this.config.candidateWindowSize,
    );
    const matching = this.candidates.filter(
      (candidate) => candidate.symbol === prediction.symbol,
    );
    if (matching.length < this.config.minimumCandidateVotes) {
      return;
    }

    this.confirmedSymbol = prediction.symbol;
    this.differentSymbolVotes = 0;
    this.emit({
      type: "SIGN_CONFIRMED",
      symbol: prediction.symbol,
      confidence:
        matching.reduce((sum, candidate) => sum + candidate.confidence, 0) /
        matching.length,
      occurredAt: prediction.predictedAt,
    });
  }

  notifyHandsDetected(): void {
    this.noHandStartedAt = null;
  }

  notifyHandsNotDetected(capturedAt: number): void {
    if (!this.confirmedSymbol) {
      return;
    }
    this.noHandStartedAt ??= capturedAt;
    if (
      capturedAt - this.noHandStartedAt >=
      this.config.noHandReleaseDurationMs
    ) {
      this.release(capturedAt);
    }
  }

  reset(): void {
    this.candidates = [];
    this.confirmedSymbol = null;
    this.differentSymbolVotes = 0;
    this.noHandStartedAt = null;
  }

  private release(occurredAt: number): void {
    this.reset();
    this.emit({ type: "HAND_RELEASED", occurredAt });
  }

  private emit(event: WordDecoderEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
