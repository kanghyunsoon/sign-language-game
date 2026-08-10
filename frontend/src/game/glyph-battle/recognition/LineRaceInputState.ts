import type { RecognitionConnectionState } from "../../recognition";
import type { LineRaceResolvedInput } from "./LineRaceInputContext";
import type { LineRaceSignFeedback } from "./LineRaceSignFeedback";
import type { SignPredictionCandidate } from "../../recognition/types/events";

export interface LineRaceInputState {
  readonly connectionState: RecognitionConnectionState;
  readonly prediction: { readonly symbol: string; readonly confidence: number; readonly isStable: boolean } | null;
  readonly confirmedSymbol: string | null;
  readonly lockedSymbol: string | null;
  /** A short, visible hold before a confirmed sign becomes a game command. */
  readonly chargingSelection?: { readonly symbol: string; readonly startedAt: number; readonly completesAt: number } | null;
  readonly lastResolution: LineRaceResolvedInput | null;
  readonly feedback: LineRaceSignFeedback;
  readonly error: string | null;
  readonly contextual?: {
    readonly rawTop1: SignPredictionCandidate;
    readonly selectedCandidate?: SignPredictionCandidate;
    readonly eligibleSymbols: readonly string[];
    readonly selectedThreshold?: number;
    readonly margin?: number;
    readonly rejectionReason?: string;
    readonly contextRevision: string;
    readonly occurredAt: number;
  };
}
