export type LineRaceAttackRejectionReason =
  | "SYMBOL_NOT_IN_HAND"
  | "ATTACK_COOLDOWN"
  | "MAX_PENDING_OBSTACLES"
  | "UNSUPPORTED_SYMBOL"
  | "MATCH_NOT_PLAYING"
  | "PLAYER_NOT_FOUND"
  | "DUPLICATE_COMMAND";

export type LineRaceCounterFailureReason =
  | "SYMBOL_MISMATCH"
  | "COUNTER_WINDOW_EXPIRED"
  | "OBSTACLE_NOT_COUNTERABLE"
  | "OBSTACLE_NOT_FOUND"
  | "DUPLICATE_COMMAND";

export class LineRaceMessageParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LineRaceMessageParseError";
  }
}
