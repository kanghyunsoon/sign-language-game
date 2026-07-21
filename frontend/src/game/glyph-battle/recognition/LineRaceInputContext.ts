export type LineRaceInputMatchState = "IDLE" | "COUNTDOWN" | "PLAYING" | "FINISHED";

export interface LineRaceCounterableObstacle {
  readonly obstacleId: string;
  readonly symbol: string;
  readonly distanceToRunner: number;
  readonly counterDeadlineAt: number;
  readonly state: "WARNING" | "FALLING" | "ACTIVE";
}

export interface LineRaceInputContext {
  readonly matchState: LineRaceInputMatchState;
  readonly attackHand: readonly string[];
  readonly attackCooldownEndsAt: number;
  readonly now: number;
  readonly pendingObstacleCount: number;
  readonly maxPendingObstacles: number;
  readonly counterWindowMs?: number;
  readonly supportedSymbols: readonly string[];
  readonly counterableObstacles: readonly LineRaceCounterableObstacle[];
}

export type LineRaceResolvedInput =
  | { readonly type: "COUNTER"; readonly obstacleId: string; readonly symbol: string }
  | { readonly type: "ATTACK"; readonly symbol: string }
  | {
      readonly type: "INVALID";
      readonly symbol: string;
      readonly reason:
        | "MATCH_NOT_PLAYING"
        | "SYMBOL_NOT_IN_HAND"
        | "ATTACK_COOLDOWN"
        | "NO_AVAILABLE_ACTION";
    };
