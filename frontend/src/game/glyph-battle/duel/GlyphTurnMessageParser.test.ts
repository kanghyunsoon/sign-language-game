import { describe, expect, it } from "vitest";
import { parseGlyphTurnChoiceCommand, parseGlyphTurnServerEvent } from "./GlyphTurnMessageParser";

const matchId = "51000000-0000-4000-8000-000000000001";
const eventBase = { eventId:"71000000-0000-4000-8000-000000000001", matchId, sequence:1, occurredAt:1_784_100_010_000, turn:1 };

describe("GlyphTurnMessageParser", () => {
  it("parses a choice command and a snapshot", () => {
    expect(parseGlyphTurnChoiceCommand({ type:"GLYPH_TURN_CHOICE_COMMAND", commandId:"41000000-0000-4000-8000-000000000001", matchId, turn:1, symbol:"ㄱ", chosenAt:1_784_100_010_000 }).symbol).toBe("ㄱ");
    expect(parseGlyphTurnServerEvent({ type:"GLYPH_DUEL_SNAPSHOT", ...eventBase, serverTime:1_784_100_010_000, turnEndsAt:1_784_100_020_000, phase:"PLANNING", lockedPlayerIds:[], fighters:[{ playerId:"me" }, { playerId:"you" }] }).type).toBe("GLYPH_DUEL_SNAPSHOT");
  });
  it("rejects a LOCK payload that would reveal an opponent choice", () => {
    expect(() => parseGlyphTurnServerEvent({ type:"GLYPH_TURN_CHOICE_LOCKED", ...eventBase, playerId:"21000000-0000-4000-8000-000000000001", symbol:"ㅊ" })).toThrow("must not contain symbol");
  });
  it("rejects a malformed turn", () => {
    expect(() => parseGlyphTurnChoiceCommand({ type:"GLYPH_TURN_CHOICE_COMMAND", commandId:"41000000-0000-4000-8000-000000000001", matchId, turn:0, symbol:"ㄱ", chosenAt:1 })).toThrow("turn");
  });
});
