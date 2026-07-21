export interface LineRaceBotConfig {
  readonly botId: string;
  readonly displayName: string;
  readonly attackIntervalMinMs: number;
  readonly attackIntervalMaxMs: number;
  readonly counterReactionMinMs: number;
  readonly counterReactionMaxMs: number;
  readonly counterSuccessRate: number;
  readonly supportedSymbols: readonly string[];
  readonly randomSeed: number;
}

export function validateLineRaceBotConfig(config: LineRaceBotConfig): LineRaceBotConfig {
  if (!config.botId || !config.displayName) throw new Error("Bot identity is required.");
  for (const [minimum, maximum, name] of [
    [config.attackIntervalMinMs, config.attackIntervalMaxMs, "attack interval"],
    [config.counterReactionMinMs, config.counterReactionMaxMs, "counter reaction"],
  ] as const) if (!Number.isFinite(minimum) || minimum <= 0 || maximum < minimum) throw new RangeError(`Invalid ${name}.`);
  if (config.counterSuccessRate < 0 || config.counterSuccessRate > 1) throw new RangeError("Counter success rate must be between 0 and 1.");
  if (config.supportedSymbols.length === 0) throw new Error("Bot requires supported symbols.");
  return config;
}
