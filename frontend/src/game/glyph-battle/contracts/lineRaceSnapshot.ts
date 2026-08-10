import type {
  LineRaceMatchConfig,
  LineRaceMatchStatus,
  LineRaceObstacle,
  LineRacePublicPlayerState,
  LineRaceMatchResult,
} from "./lineRaceTypes";

export interface LineRaceMatchSnapshot {
  readonly matchId: string;
  readonly roomId: string;
  readonly status: LineRaceMatchStatus;
  readonly serverTime: number;
  readonly startAt?: number;
  readonly finishDeadlineAt?: number;
  readonly config: LineRaceMatchConfig;
  readonly players: readonly LineRacePublicPlayerState[];
  readonly obstacles: readonly LineRaceObstacle[];
  /** Private to the authenticated requesting player. Never broadcast. */
  readonly myAttackHand: readonly string[];
  /** Present for FINISHED snapshots so a missed finish event is fully recoverable. */
  readonly result?: LineRaceMatchResult;
  readonly sequence: number;
}
