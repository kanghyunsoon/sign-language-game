import type { SignPredictionCandidate, SignRecognitionEvent } from "../types/events";

export type PredictionEvent = Extract<SignRecognitionEvent, { readonly type: "PREDICTION" }>;
export type ContextualSelectionEvent = Extract<SignRecognitionEvent, { readonly type: "CONTEXTUAL_SELECTION" }>;

export interface ContextualPredictionResolution {
  readonly selectedCandidate?: SignPredictionCandidate;
  readonly diagnostics: ContextualSelectionEvent;
}

export interface ContextualPredictionSelector {
  captureContext(aiSupportedSymbols: readonly string[]): string;
  resolve(prediction: PredictionEvent, aiSupportedSymbols: readonly string[], capturedContextRevision: string): ContextualPredictionResolution;
}
