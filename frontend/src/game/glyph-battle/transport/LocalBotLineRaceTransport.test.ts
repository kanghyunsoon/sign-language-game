import { describe, expect, it } from "vitest";
import { createDevLineRaceScenario } from "../dev/createDevLineRaceScenario";
import { DefaultLocalLineRaceCommandGateway } from "./LocalLineRaceCommandGateway";
import { LocalBotLineRaceTransport } from "./LocalBotLineRaceTransport";

describe("LocalBotLineRaceTransport", () => {
  it("collects attack, counter, combo, symbol, and traversal result statistics", async () => {
    let now = 0; const scenario = createDevLineRaceScenario({ countdownMs: 1 }, () => now); scenario.controller.start(); now = 1; scenario.runtime.update(now);
    const gateway = new DefaultLocalLineRaceCommandGateway({ controller: scenario.controller }); const transport = new LocalBotLineRaceTransport(gateway, scenario.controller, "PLAYER_A", () => now);
    await transport.submitAttack({ commandId: "a1", symbol: "ㄱ", recognizedAt: 0 });
    const incoming = scenario.controller.spawnObstacle({ symbol: "ㄴ", targetPlayerId: "PLAYER_A" });
    await transport.submitCounter({ commandId: "c1", obstacleId: incoming.obstacleId, symbol: "ㄴ", recognizedAt: 1 });
    expect(transport.getStatistics()).toMatchObject({ attacksAttempted: 1, attacksSucceeded: 1, countersAttempted: 1, countersSucceeded: 1, maxCombo: 2, averageRecognitionMs: .5 });
    expect(transport.getStatistics().symbols).toEqual(expect.arrayContaining([expect.objectContaining({ symbol: "ㄱ", attacksSucceeded: 1 }), expect.objectContaining({ symbol: "ㄴ", countersSucceeded: 1 })]));
  });
});
