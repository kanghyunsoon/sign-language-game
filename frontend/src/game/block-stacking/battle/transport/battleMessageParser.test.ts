import { describe, expect, it } from "vitest";
import { BattleMessageParseError, parseBattleMessage } from "./battleMessageParser";
describe("parseBattleMessage", () => {
  it("parses a server spawn", () => { const value = parseBattleMessage(JSON.stringify({ type: "SPAWN_LETTER", sequence: 1, matchId: "m", playerId: "p", letterId: "l", spawnIndex: 0, symbol: "ㄱ", spawnAt: new Date().toISOString(), normalizedX: .5, initialAngle: 0 })); expect(value.type).toBe("SPAWN_LETTER"); });
  it("rejects unknown message types", () => { expect(() => parseBattleMessage({ type: "HACK", sequence: 1 })).toThrow(BattleMessageParseError); });
  it("rejects malformed body transforms", () => { expect(() => parseBattleMessage({ type: "BODY_TRANSFORM_BATCH", sequence: 1, matchId: "m", playerId: "p", sentAt: "now", bodies: [{ letterId: "l" }] })).toThrow(BattleMessageParseError); });
});

