import { describe, expect, it } from "vitest";
import { matchBroadcastDestination, playerMatchDestination, resolveMatchChannelConfig } from "./MatchChannelConfig";

describe("MatchChannelConfig", () => {
  it("keeps the existing backend destinations as defaults", () => {
    const config = resolveMatchChannelConfig();
    expect(config.commandDestination).toBe("/app/game/message");
    expect(playerMatchDestination(config, "player-1")).toBe("/queue/game/player/player-1");
    expect(matchBroadcastDestination(config, "match-1")).toBe("/topic/game/match/match-1");
  });

  it("allows a replacement backend shell without game-code changes", () => {
    const config = resolveMatchChannelConfig({ commandDestination: "/app/matches/command", playerDestinationTemplate: "/user/{playerId}/matches", matchDestinationTemplate: "/topic/matches/{matchId}/events" });
    expect(config.commandDestination).toBe("/app/matches/command");
    expect(playerMatchDestination(config, "user/a")).toBe("/user/user%2Fa/matches");
    expect(matchBroadcastDestination(config, "m 1")).toBe("/topic/matches/m%201/events");
  });

  it("rejects a template that cannot address a match", () => {
    expect(() => resolveMatchChannelConfig({ matchDestinationTemplate: "/topic/matches" })).toThrow("{matchId}");
  });
});
