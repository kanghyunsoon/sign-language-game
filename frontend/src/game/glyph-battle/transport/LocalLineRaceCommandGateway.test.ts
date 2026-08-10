import { describe, expect, it, vi } from "vitest";
import { createDevLineRaceScenario } from "../dev/createDevLineRaceScenario";
import { DefaultLocalLineRaceCommandGateway } from "./LocalLineRaceCommandGateway";

function playingScenario() {
  let now = 0;
  const scenario = createDevLineRaceScenario({ countdownMs: 1 }, () => now);
  scenario.controller.start(); now = 1; scenario.runtime.update(now);
  return { scenario, get now() { return now; }, set now(value: number) { now = value; } };
}

describe("DefaultLocalLineRaceCommandGateway", () => {
  it("consumes an attack card, draws a replacement, and creates an opponent obstacle", async () => {
    const test = playingScenario();
    const gateway = new DefaultLocalLineRaceCommandGateway({ controller: test.scenario.controller, now: () => test.now, random: () => 0 });
    await gateway.submitAttack({ commandId: "attack-1", symbol: "ㄱ", recognizedAt: test.now });
    const state = gateway.getSnapshot();
    expect(state.attackHand).toHaveLength(3);
    expect(state.attackHand).not.toEqual(["ㄱ", "ㅏ", "ㅁ"]);
    expect(test.scenario.controller.getSnapshot().obstacles[0]).toMatchObject({ symbol: "ㄱ", targetPlayerId: "PLAYER_B" });
    await expect(gateway.submitAttack({ commandId: "attack-1", symbol: "ㅏ", recognizedAt: test.now })).rejects.toThrow("DUPLICATE_COMMAND");
  });

  it("counters warning obstacles without consuming an attack card", async () => {
    const test = playingScenario();
    const gateway = new DefaultLocalLineRaceCommandGateway({ controller: test.scenario.controller, now: () => test.now });
    const obstacle = test.scenario.controller.spawnObstacle({ symbol: "ㄴ", targetPlayerId: "PLAYER_A" });
    const before = gateway.getSnapshot().attackHand;
    await gateway.submitCounter({ commandId: "counter-1", obstacleId: obstacle.obstacleId, symbol: "ㄴ", recognizedAt: test.now });
    expect(gateway.getSnapshot().attackHand).toEqual(before);
    expect(test.scenario.controller.getSnapshot().obstacles[0]?.state).toBe("COUNTERED");
  });

  it("reports closest counterable obstacles and cleans subscribers", () => {
    const test = playingScenario();
    const gateway = new DefaultLocalLineRaceCommandGateway({ controller: test.scenario.controller, now: () => test.now });
    test.scenario.controller.spawnObstacle({ symbol: "ㄱ", targetPlayerId: "PLAYER_A", coursePosition: 300 });
    test.scenario.controller.spawnObstacle({ symbol: "ㄱ", targetPlayerId: "PLAYER_A", coursePosition: 200 });
    expect(gateway.getInputContext().counterableObstacles.map((item) => item.distanceToRunner)).toEqual([200, 300]);
    const listener = vi.fn(); gateway.subscribe(listener); gateway.dispose();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("rejects a hand containing three identical cards", () => {
    const test = playingScenario();
    expect(() => new DefaultLocalLineRaceCommandGateway({ controller: test.scenario.controller, initialHand: ["ㄱ", "ㄱ", "ㄱ"] })).toThrow("only one repeated symbol");
  });
});
