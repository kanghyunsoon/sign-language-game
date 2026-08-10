export type LineRaceActionFeedbackType =
  | "ATTACK_RECOGNIZED"
  | "ATTACK_SENT"
  | "ATTACK_SUCCEEDED"
  | "ATTACK_REJECTED"
  | "COUNTER_RECOGNIZED"
  | "COUNTER_SENT"
  | "COUNTER_SUCCEEDED"
  | "COUNTER_MISSED"
  | "RESULT_UNKNOWN"
  | "RELEASE_REQUIRED";

export interface LineRaceActionFeedback {
  readonly type: LineRaceActionFeedbackType;
  readonly commandId?: string;
  readonly actionKind?: "ATTACK" | "COUNTER";
  readonly symbol?: string;
  readonly obstacleId?: string;
  readonly occurredAt: number;
  readonly reason?: string;
  readonly sourceEventId?: string;
}

export type LineRaceUserFeedbackState =
  | "IDLE"
  | "TARGET_AVAILABLE"
  | "HAND_NOT_VISIBLE"
  | "RECOGNIZING"
  | "CONFIRMING"
  | "AMBIGUOUS"
  | "CONFIRMED"
  | "ACTION_PENDING"
  | "SUCCESS"
  | "REJECTED"
  | "RELEASE_REQUIRED"
  | "RESULT_UNKNOWN"
  | "DISCONNECTED";

export type LineRaceActionTarget =
  | {
      readonly kind: "COUNTER";
      readonly symbols: readonly string[];
      readonly primarySymbol: string;
      readonly obstacleId: string;
      readonly counterRemainingMs?: number;
      readonly counterDurationMs?: number;
      readonly available: true;
    }
  | {
      readonly kind: "ATTACK";
      readonly symbols: readonly string[];
      readonly available: boolean;
      readonly cooldownRemainingMs: number;
    }
  | { readonly kind: "NONE"; readonly symbols: readonly []; readonly available: false };

export interface LineRaceUserFeedbackView {
  readonly state: LineRaceUserFeedbackState;
  readonly target: LineRaceActionTarget;
  readonly message: string;
  readonly symbol?: string;
  readonly obstacleId?: string;
  readonly commandId?: string;
  readonly actionKind?: "ATTACK" | "COUNTER";
  readonly recognitionProgress?: number;
  readonly urgencyProgress?: number;
  readonly effectKey?: string;
}
