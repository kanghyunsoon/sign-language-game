/** Typed mirror of ai/contracts/balance/line-race-obstacles.json. Drift tests compare every field. */
export const LINE_RACE_MATCH_BALANCE = Object.freeze({
  raceLength: 1_050,
  baseSpeedPerSecond: 28,
  matchDurationMs: 60_000,
  countdownMs: 3_000,
  handSize: 3,
  attackCooldownMs: 700,
  warningDurationMs: 800,
  counterWindowMs: 2_200,
  obstacleLeadDistance: 160,
  minimumObstacleSpacing: 60,
  maxPendingObstacles: 4,
  reconnectGraceMs: 10_000,
  comboTimeoutMs: 5_000,
  empoweredAttackEnabled: false,
} as const);

export const LINE_RACE_RUNTIME_TRANSFORMS = Object.freeze({
  traversalDurationScale: 1.0,
} as const);

export const LINE_RACE_BOT_BALANCE = Object.freeze({
  EASY: { minAttackIntervalMs: 2_500, maxAttackIntervalMs: 4_500, minCounterReactionMs: 1_200, maxCounterReactionMs: 2_200, counterSuccessRate: 0.35 },
  NORMAL: { minAttackIntervalMs: 1_250, maxAttackIntervalMs: 2_200, minCounterReactionMs: 625, maxCounterReactionMs: 1_350, counterSuccessRate: 0.68 },
  HARD: { minAttackIntervalMs: 800, maxAttackIntervalMs: 1_500, minCounterReactionMs: 400, maxCounterReactionMs: 900, counterSuccessRate: 0.85 },
} as const);
