import { describe, expect, it, vi } from "vitest";
import { createDevLineRaceScenario } from "../dev/createDevLineRaceScenario";
import { DefaultLocalLineRaceCommandGateway, LocalBotLineRaceTransport } from "../transport";
import { MockLineRaceBot } from "./MockLineRaceBot";
import type { LineRaceBotConfig } from "./LineRaceBotConfig";
import { SeededRandom } from "./SeededRandom";

const config = (symbols: readonly string[], success: number): LineRaceBotConfig => ({ botId: "PLAYER_B", displayName: "test", attackIntervalMinMs: 100, attackIntervalMaxMs: 100, counterReactionMinMs: 10, counterReactionMaxMs: 10, counterSuccessRate: success, supportedSymbols: symbols, randomSeed: 7 });

function setup(success = 1, maxPendingObstacles = 6) {
  let now = 0; const scenario = createDevLineRaceScenario({ countdownMs: 1 }, () => now); scenario.controller.start(); now = 1; scenario.runtime.update(now);
  const symbols = scenario.controller.getObstacleTemplates().map((item) => item.symbol); const random = new SeededRandom(7);
  const botGateway = new DefaultLocalLineRaceCommandGateway({ controller: scenario.controller, localPlayerId: "PLAYER_B", opponentPlayerId: "PLAYER_A", initialHand: ["ㄱ", "ㄴ", "ㅁ"], maxPendingObstacles, random: () => random.next() });
  const userGateway = new DefaultLocalLineRaceCommandGateway({ controller: scenario.controller, localPlayerId: "PLAYER_A", opponentPlayerId: "PLAYER_B" });
  const transport = new LocalBotLineRaceTransport(botGateway, scenario.controller, "PLAYER_B");
  const bot = new MockLineRaceBot({ config: config(symbols, success), transport, random });
  return { scenario, transport, bot, userGateway, setNow: (value: number) => { now = value; scenario.runtime.update(value); }, get now() { return now; } };
}

describe("MockLineRaceBot", () => {
  it("uses a hand card, consumes it, and attacks the user lane", async () => {
    const test = setup(); const before = test.transport.getSnapshot().attackHand;
    await test.bot.attackNow();
    expect(test.scenario.controller.getSnapshot().obstacles[0]?.targetPlayerId).toBe("PLAYER_A");
    expect(test.transport.getSnapshot().attackHand).toHaveLength(3); expect(test.transport.getSnapshot().attackHand).not.toEqual(before);
    await expect(test.bot.attackNow()).rejects.toThrow("ATTACK_COOLDOWN");
  });

  it("cannot bypass the shared pending-obstacle limit", async () => {
    const test = setup(1, 1); await test.bot.attackNow(); test.setNow(1_001);
    await expect(test.bot.attackNow()).rejects.toThrow("MAX_PENDING_OBSTACLES");
    expect(test.scenario.controller.getSnapshot().obstacles).toHaveLength(1);
  });

  it("submits successful counters after the deterministic reaction delay", async () => {
    const test = setup(1); await test.userGateway.submitAttack({ commandId: "user-1", symbol: "ㄱ", recognizedAt: test.now });
    test.bot.tick(); test.setNow(11); test.bot.tick(); await Promise.resolve();
    expect(test.scenario.controller.getSnapshot().obstacles[0]?.state).toBe("COUNTERED");
    expect(test.transport.getStatistics().countersSucceeded).toBe(1);
  });

  it("records a failed counter without submitting a command", async () => {
    const test = setup(0); await test.userGateway.submitAttack({ commandId: "user-1", symbol: "ㄱ", recognizedAt: test.now });
    test.bot.tick(); test.setNow(11); test.bot.tick();
    expect(test.scenario.controller.getSnapshot().obstacles[0]?.state).toBe("WARNING");
    expect(test.transport.getStatistics()).toMatchObject({ countersAttempted: 1, countersSucceeded: 0 });
  });

  it("cleans its only scheduler and pending decisions", () => {
    const test = setup(); const setTimer = vi.fn(() => 99 as unknown as ReturnType<typeof setInterval>); const clearTimer = vi.fn();
    const bot = new MockLineRaceBot({ config: config(test.scenario.controller.getObstacleTemplates().map((item) => item.symbol), .5), transport: test.transport, setTimer, clearTimer });
    bot.start(); bot.dispose(); expect(setTimer).toHaveBeenCalledTimes(1); expect(clearTimer).toHaveBeenCalledTimes(1); expect(bot.getState().running).toBe(false);
  });
});
