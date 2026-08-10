import { LINE_RACE_MATCH_BALANCE } from "../core/LineRaceBalance";

export const JAMO_OBSTACLE_BALANCE = {
  warningDurationMs: LINE_RACE_MATCH_BALANCE.warningDurationMs,
  removalDurationMs: 420,
  obstacleLeadDistance: LINE_RACE_MATCH_BALANCE.obstacleLeadDistance,
  minimumObstacleSpacing: LINE_RACE_MATCH_BALANCE.minimumObstacleSpacing,
  traversalHeightRatio: 0.28,
} as const;
