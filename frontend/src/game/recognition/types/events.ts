export type RecognitionConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR";

export interface SignPredictionCandidate {
  readonly symbol: string;
  readonly confidence: number;
}

export type SignRecognitionEvent =
  | {
      readonly type: "CONNECTION_STATE";
      readonly state: RecognitionConnectionState;
      readonly changedAt: number;
    }
  | {
      readonly type: "CAPABILITIES";
      readonly modelVersion: string;
      readonly supportedSymbols: readonly string[];
      readonly sequenceLength: number;
      readonly competitiveSymbols?: readonly string[];
      readonly confidenceThresholds?: Readonly<Record<string, number>>;
      readonly confirmationAuthority?: "FRONTEND_TEMPORAL_DECODER";
    }
  | {
      readonly type: "PREDICTION";
      readonly frameId: number;
      readonly symbol: string;
      readonly confidence: number;
      readonly isStable: boolean;
      readonly predictedAt: number;
      readonly topCandidates?: readonly SignPredictionCandidate[];
      /** "live" = 수행 중 실시간 후보, "final" = 확정. word 모델 v7부터 존재. */
      readonly stage?: "live" | "final";
      /** symbol이 "wrong"이거나 물리량/손가락 규칙을 어겼을 때의 판정 사유. */
      readonly verdict?: "correct" | "wrong-form" | "out-of-range" | "detail";
      readonly feedback?: readonly string[];
    }
  | {
      readonly type: "CONTEXTUAL_SELECTION";
      readonly rawTop1: SignPredictionCandidate;
      readonly selectedCandidate?: SignPredictionCandidate;
      readonly eligibleSymbols: readonly string[];
      readonly selectedThreshold?: number;
      readonly margin?: number;
      readonly rejectionReason?: "NO_ELIGIBLE_CANDIDATE" | "BELOW_THRESHOLD" | "AMBIGUOUS" | "STALE_CONTEXT";
      readonly contextRevision: string;
      readonly occurredAt: number;
    }
  | {
      readonly type: "SIGN_CONFIRMED";
      readonly symbol: string;
      readonly confidence: number;
      readonly confirmedAt: number;
      readonly modelVersion: string;
    }
  | {
      readonly type: "HAND_RELEASED";
      readonly releasedAt: number;
    }
  | {
      readonly type: "ERROR";
      readonly code: string;
      readonly message: string;
    };

export type RecognitionCapabilities = Extract<SignRecognitionEvent, { readonly type: "CAPABILITIES" }>;
