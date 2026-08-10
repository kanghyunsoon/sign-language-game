import type { ContextualPredictionResolution, ContextualPredictionSelector, PredictionEvent } from "../../recognition/contextual";
import { COMPETITIVE_RECOGNITION_SYMBOLS, RECOGNITION_CONFIDENCE_BY_SYMBOL } from "../../recognition/readiness/recognitionReadiness";
import type { LineRaceInputContext } from "./LineRaceInputContext";

export interface LineRaceContextualCandidateResolverConfig {
  readonly minimumEligibleMargin: number;
}

export const DEFAULT_LINE_RACE_CONTEXTUAL_CANDIDATE_CONFIG: LineRaceContextualCandidateResolverConfig = Object.freeze({
  minimumEligibleMargin: 0.12,
});

interface ContextSnapshot { readonly revision: string; readonly eligibleSymbols: readonly string[] }

export class LineRaceContextualCandidateResolver implements ContextualPredictionSelector {
  private readonly config: LineRaceContextualCandidateResolverConfig;

  constructor(
    private readonly getContext: () => LineRaceInputContext,
    config: Partial<LineRaceContextualCandidateResolverConfig> = {},
  ) {
    this.config = { ...DEFAULT_LINE_RACE_CONTEXTUAL_CANDIDATE_CONFIG, ...config };
    if (!Number.isFinite(this.config.minimumEligibleMargin) || this.config.minimumEligibleMargin < 0 || this.config.minimumEligibleMargin > 1) throw new RangeError("minimumEligibleMargin must be between 0 and 1");
  }

  captureContext(aiSupportedSymbols: readonly string[]): string {
    return this.snapshot(aiSupportedSymbols).revision;
  }

  resolve(prediction: PredictionEvent, aiSupportedSymbols: readonly string[], capturedContextRevision: string): ContextualPredictionResolution {
    const context = this.snapshot(aiSupportedSymbols);
    const rawTop1 = { symbol: prediction.symbol, confidence: prediction.confidence };
    const base = { type: "CONTEXTUAL_SELECTION" as const, rawTop1, eligibleSymbols: context.eligibleSymbols,
      contextRevision: context.revision, occurredAt: prediction.predictedAt };
    if (capturedContextRevision !== context.revision) return { diagnostics: { ...base, rejectionReason: "STALE_CONTEXT" } };
    const eligible = new Set(context.eligibleSymbols);
    const candidates = (prediction.topCandidates ?? [rawTop1]).filter((candidate) => eligible.has(candidate.symbol));
    const selected = candidates[0];
    if (!selected) return { diagnostics: { ...base, rejectionReason: "NO_ELIGIBLE_CANDIDATE" } };
    const threshold = RECOGNITION_CONFIDENCE_BY_SYMBOL[selected.symbol];
    if (threshold === undefined || selected.confidence < threshold) return {
      diagnostics: { ...base, selectedCandidate: selected, selectedThreshold: threshold, rejectionReason: "BELOW_THRESHOLD" },
    };
    const runnerUp = candidates[1]?.confidence ?? 0;
    const margin = selected.confidence - runnerUp;
    if (margin < this.config.minimumEligibleMargin) return {
      diagnostics: { ...base, selectedCandidate: selected, selectedThreshold: threshold, margin, rejectionReason: "AMBIGUOUS" },
    };
    return { selectedCandidate: selected, diagnostics: { ...base, selectedCandidate: selected, selectedThreshold: threshold, margin } };
  }

  private snapshot(aiSupportedSymbols: readonly string[]): ContextSnapshot {
    const context = this.getContext();
    const ai = new Set(aiSupportedSymbols), competitive = new Set(COMPETITIVE_RECOGNITION_SYMBOLS), match = new Set(context.supportedSymbols);
    const counters = context.counterableObstacles
      .filter((obstacle) => obstacle.counterDeadlineAt >= context.now)
      .slice().sort((left, right) => left.distanceToRunner - right.distanceToRunner || left.obstacleId.localeCompare(right.obstacleId));
    const source = counters.length > 0 ? counters.map((obstacle) => obstacle.symbol) : context.attackHand;
    const eligibleSymbols = context.matchState === "PLAYING"
      ? [...new Set(source.filter((symbol) => ai.has(symbol) && competitive.has(symbol) && match.has(symbol)))]
      : [];
    const revision = JSON.stringify({
      state: context.matchState,
      hand: context.attackHand,
      // Distance/deadline naturally change every frame. Only identity, symbol, and
      // priority order define recognition context; otherwise votes could never accumulate.
      counters: counters.map((obstacle) => [obstacle.obstacleId, obstacle.symbol]),
      matchSupported: [...match].sort(), aiSupported: [...ai].sort(), eligibleSymbols,
    });
    return { revision, eligibleSymbols };
  }
}
