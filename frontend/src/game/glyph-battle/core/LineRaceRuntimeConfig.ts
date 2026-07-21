import { LINE_RACE_MATCH_BALANCE } from "./LineRaceBalance";

export interface LineRaceRuntimeConfig {
  readonly raceLength: number;
  readonly baseSpeedPerSecond: number;
  readonly matchDurationMs: number;
  readonly countdownMs: number;
}

export const DEFAULT_LINE_RACE_RUNTIME_CONFIG: LineRaceRuntimeConfig = {
  raceLength: LINE_RACE_MATCH_BALANCE.raceLength,
  baseSpeedPerSecond: LINE_RACE_MATCH_BALANCE.baseSpeedPerSecond,
  matchDurationMs: LINE_RACE_MATCH_BALANCE.matchDurationMs,
  countdownMs: LINE_RACE_MATCH_BALANCE.countdownMs,
};

export function resolveLineRaceRuntimeConfig(
  config: Partial<LineRaceRuntimeConfig> = {},
): LineRaceRuntimeConfig {
  const resolved = { ...DEFAULT_LINE_RACE_RUNTIME_CONFIG, ...config };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a finite positive number.`);
    }
  }
  return resolved;
}
