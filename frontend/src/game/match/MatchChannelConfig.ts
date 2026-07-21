export interface MatchChannelConfig {
  readonly commandDestination: string;
  readonly playerDestinationTemplate: string;
  readonly matchDestinationTemplate: string;
}

export const DEFAULT_MATCH_CHANNEL_CONFIG: MatchChannelConfig = Object.freeze({
  commandDestination: "/app/game/message",
  playerDestinationTemplate: "/queue/game/player/{playerId}",
  matchDestinationTemplate: "/topic/game/match/{matchId}",
});

export function resolveMatchChannelConfig(overrides?: Partial<MatchChannelConfig>): MatchChannelConfig {
  const value = { ...DEFAULT_MATCH_CHANNEL_CONFIG, ...overrides };
  assertDestination(value.commandDestination, "commandDestination");
  assertTemplate(value.playerDestinationTemplate, "{playerId}", "playerDestinationTemplate");
  assertTemplate(value.matchDestinationTemplate, "{matchId}", "matchDestinationTemplate");
  return Object.freeze(value);
}

export function playerMatchDestination(config: MatchChannelConfig, playerId: string): string {
  return expand(config.playerDestinationTemplate, "{playerId}", playerId);
}

export function matchBroadcastDestination(config: MatchChannelConfig, matchId: string): string {
  return expand(config.matchDestinationTemplate, "{matchId}", matchId);
}

function assertTemplate(value: string, token: string, label: string): void {
  assertDestination(value, label);
  if (!value.includes(token)) throw new Error(`${label} must contain ${token}.`);
}

function assertDestination(value: string, label: string): void {
  if (!value.trim().startsWith("/")) throw new Error(`${label} must be an absolute STOMP destination.`);
}

function expand(template: string, token: string, id: string): string {
  if (!id.trim()) throw new Error(`${token.slice(1, -1)} must not be empty.`);
  return template.replace(token, encodeURIComponent(id));
}
