export const GAME_ERROR_CODES = [
  "GAME_SOLO_SESSION_NOT_FOUND",
  "GAME_SOLO_SESSION_ALREADY_COMPLETED",
  "GAME_SOLO_RESULT_INVALID",
  "GAME_ROOM_NOT_READY",
  "GAME_NOT_ROOM_HOST",
  "GAME_MATCH_NOT_FOUND",
  "GAME_MATCH_NOT_PLAYING",
  "GAME_PLAYER_NOT_IN_MATCH",
  "GAME_LETTER_NOT_FOUND",
  "GAME_LETTER_ALREADY_REMOVED",
  "GAME_SYMBOL_MISMATCH",
  "GAME_DUPLICATE_COMMAND",
  "GAME_INVALID_SEQUENCE",
  "GAME_RECONNECT_TIMEOUT",
  "GAME_MATCH_ALREADY_FINISHED",
  "GAME_RTC_TOKEN_ISSUE_FAILED",
  "GAME_RTC_ROOM_MISMATCH",
] as const;

export type GameErrorCode = (typeof GAME_ERROR_CODES)[number];

/** Payload only. A host backend owns the common response/error envelope. */
export interface GameErrorPayload {
  readonly code: GameErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

