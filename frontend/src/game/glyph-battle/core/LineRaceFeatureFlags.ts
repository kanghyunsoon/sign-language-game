export interface LineRaceFeatureFlags {
  readonly enabled: boolean;
  readonly devHarnessEnabled: boolean;
  readonly frontendMockBotEnabled: boolean;
  readonly serverBotEnabled: boolean;
}

export const DEFAULT_LINE_RACE_FEATURE_FLAGS: LineRaceFeatureFlags = {
  enabled: true,
  devHarnessEnabled: import.meta.env.VITE_LINE_RACE_DEV_TOOLS === "true",
  frontendMockBotEnabled: import.meta.env.VITE_LINE_RACE_DEV_TOOLS === "true",
  serverBotEnabled: true,
};

export function isLineRaceDevHarnessEnabled(
  dev = import.meta.env.DEV,
  flags: LineRaceFeatureFlags = DEFAULT_LINE_RACE_FEATURE_FLAGS,
): boolean {
  return dev && flags.enabled && flags.devHarnessEnabled;
}

export function isLineRaceMockBotPracticeEnabled(
  dev = import.meta.env.DEV,
  flags: LineRaceFeatureFlags = DEFAULT_LINE_RACE_FEATURE_FLAGS,
): boolean {
  return dev && flags.enabled && flags.frontendMockBotEnabled;
}

export function isLineRaceServerBotEnabled(
  _dev = import.meta.env.DEV,
  flags: LineRaceFeatureFlags = DEFAULT_LINE_RACE_FEATURE_FLAGS,
): boolean {
  return flags.enabled && flags.serverBotEnabled;
}
