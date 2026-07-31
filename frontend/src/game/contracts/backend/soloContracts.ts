export type ExternalUuid = string;
export type EpochMillis = number;

/** POST /solo-results request body from the current OpenAPI document. */
export interface SoloResultRequest {
  /** Completed play duration in whole seconds. Minimum 1. */
  readonly score: number;
}

/** POST /solo-results response body from the current OpenAPI document. */
export interface SoloResultResponse {
  readonly resultId: number;
  readonly score: number;
}

export interface SoloRankingEntry {
  readonly rank: number;
  readonly userId: number;
  readonly nickname: string;
  readonly score: number;
}

/** GET /rankings?gameType=TETRIS_SOLO response body. */
export interface SoloRankingResponse {
  readonly top: readonly SoloRankingEntry[];
  readonly me: SoloRankingEntry | null;
}

