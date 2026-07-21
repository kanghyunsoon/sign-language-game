export interface SignDecoderConfig {
  readonly minimumConfidence: number;
  readonly minimumConfidenceBySymbol?: Readonly<Record<string, number>>;
  readonly candidateWindowSize: number;
  readonly minimumCandidateVotes: number;
  readonly minimumStableDurationMs: number;
  readonly movementThreshold: number;
  readonly maximumPredictionAgeMs: number;
  readonly releasePoseDistanceThreshold: number;
  readonly releaseMinimumDurationMs: number;
  readonly noHandReleaseDurationMs: number;
  readonly differentSymbolReleaseVotes: number;
}

import { RECOGNITION_CONFIDENCE_BY_SYMBOL } from "../readiness/recognitionReadiness";

export const DEFAULT_SIGN_DECODER_CONFIG: SignDecoderConfig = Object.freeze({
  minimumConfidence: 0.75,
  minimumConfidenceBySymbol: RECOGNITION_CONFIDENCE_BY_SYMBOL,
  candidateWindowSize: 4,
  minimumCandidateVotes: 2,
  minimumStableDurationMs: 100,
  movementThreshold: 0.06,
  maximumPredictionAgeMs: 1000,
  releasePoseDistanceThreshold: 0.12,
  releaseMinimumDurationMs: 100,
  noHandReleaseDurationMs: 80,
  differentSymbolReleaseVotes: 2,
});

export function validateSignDecoderConfig(config: SignDecoderConfig): SignDecoderConfig {
  const positive = [
    config.candidateWindowSize,
    config.minimumCandidateVotes,
    config.minimumStableDurationMs,
    config.movementThreshold,
    config.maximumPredictionAgeMs,
    config.releasePoseDistanceThreshold,
    config.releaseMinimumDurationMs,
    config.noHandReleaseDurationMs,
    config.differentSymbolReleaseVotes,
  ];
  if (config.minimumConfidence < 0 || config.minimumConfidence > 1) throw new RangeError("minimumConfidence must be between 0 and 1.");
  if (config.minimumConfidenceBySymbol && Object.values(config.minimumConfidenceBySymbol).some((value) => !Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError("Per-symbol confidence thresholds must be between 0 and 1.");
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) throw new RangeError("Decoder thresholds must be positive finite values.");
  if (!Number.isInteger(config.candidateWindowSize) || !Number.isInteger(config.minimumCandidateVotes) || !Number.isInteger(config.differentSymbolReleaseVotes)) throw new RangeError("Decoder vote counts must be integers.");
  if (config.minimumCandidateVotes > config.candidateWindowSize) throw new RangeError("minimumCandidateVotes cannot exceed candidateWindowSize.");
  return config;
}
