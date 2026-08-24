import { describe, expect, it } from "vitest";
import { COMPETITIVE_RECOGNITION_SYMBOLS, RECOGNITION_CLASS_READINESS } from "../../recognition/readiness/recognitionReadiness";
import { createLocalBotPracticeSession } from "./createLocalBotPracticeSession";

// 제외 목록을 손으로 적으면 모델을 재측정할 때마다 데이터가 아니라 이 테스트가
// 깨진다(bfa7f13에서 실제로 그랬다). 계약에서 파생시킨다.
const EXCLUDED = new Set(
  RECOGNITION_CLASS_READINESS.filter((item) => !item.competitiveEligible).map((item) => item.symbol),
);
const QUARANTINED_SYMBOL = [...EXCLUDED][0]!;
const expectCompetitive = (symbols: readonly string[]) => {
  expect(symbols.length).toBeGreaterThan(0);
  expect(symbols.every((symbol) => COMPETITIVE_RECOGNITION_SYMBOLS.includes(symbol))).toBe(true);
  expect(symbols.some((symbol) => EXCLUDED.has(symbol))).toBe(false);
};

describe("local bot practice recognition readiness", () => {
  it("keeps seed 12345 initial hands and obstacle templates competitive", () => {
    const session = createLocalBotPracticeSession({ seed: 12_345 });
    expectCompetitive(session.userTransport.getSnapshot().attackHand);
    expectCompetitive(session.botTransport.getSnapshot().attackHand);
    expectCompetitive(session.scenario.controller.getObstacleTemplates().map((template) => template.symbol));
    expect(session.userTransport.getInputContext().supportedSymbols).toEqual(COMPETITIVE_RECOGNITION_SYMBOLS);
    expect(session.botTransport.getInputContext().supportedSymbols).toEqual(COMPETITIVE_RECOGNITION_SYMBOLS);
    session.dispose();
  });

  it("keeps both initial hands competitive for at least 100 seeds", () => {
    for (let seed = 0; seed < 128; seed += 1) {
      const session = createLocalBotPracticeSession({ seed });
      expectCompetitive(session.userTransport.getSnapshot().attackHand);
      expectCompetitive(session.botTransport.getSnapshot().attackHand);
      session.dispose();
    }
  });

  it("never draws or spawns an excluded symbol after repeated card use", async () => {
    let now = 0;
    const session = createLocalBotPracticeSession({
      seed: 12_345, source: () => now,
      runtimeConfig: { countdownMs: 1, matchDurationMs: 1_000_000_000, raceLength: 1_000_000_000 },
    });
    session.scenario.controller.start(); now = 1; session.scenario.runtime.update(now);
    for (let index = 0; index < 256; index += 1) {
      const transport = index % 2 === 0 ? session.userTransport : session.botTransport;
      const symbol = transport.getSnapshot().attackHand[index % 3]!;
      await transport.submitAttack({ commandId: `readiness-${index}`, symbol, recognizedAt: now });
      const obstacle = session.scenario.controller.getSnapshot().obstacles.at(-1)!;
      expectCompetitive([obstacle.symbol]);
      session.scenario.controller.counterObstacle(obstacle.obstacleId);
      expectCompetitive(session.userTransport.getSnapshot().attackHand);
      expectCompetitive(session.botTransport.getSnapshot().attackHand);
      now += 1_000;
      session.scenario.runtime.update(now);
    }
    expect(() => session.scenario.controller.spawnObstacle({ symbol: QUARANTINED_SYMBOL, targetPlayerId: "PLAYER_A" })).toThrow("Unsupported line-race obstacle symbol");
    session.dispose();
  });
});
