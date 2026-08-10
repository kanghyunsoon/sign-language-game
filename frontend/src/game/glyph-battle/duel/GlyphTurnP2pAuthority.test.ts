import { describe, expect, it } from "vitest";
import { GlyphTurnP2pAuthority } from "./GlyphTurnP2pAuthority";

describe("GlyphTurnP2pAuthority", () => {
  it("locks both choices once, resolves once, and advances the turn", () => {
    const authority = new GlyphTurnP2pAuthority("match", ["host", "guest"], () => 100, (() => { let index = 0; return () => `event-${++index}`; })());
    const events: { type: string; turn: number }[] = [];
    authority.subscribe((event) => events.push(event));
    authority.start();
    authority.submit("host", { type: "GLYPH_TURN_CHOICE_COMMAND", commandId: "a", matchId: "match", turn: 1, symbol: "ㄱ", chosenAt: 1 });
    authority.submit("host", { type: "GLYPH_TURN_CHOICE_COMMAND", commandId: "duplicate", matchId: "match", turn: 1, symbol: "ㄴ", chosenAt: 1 });
    authority.submit("guest", { type: "GLYPH_TURN_CHOICE_COMMAND", commandId: "b", matchId: "match", turn: 1, symbol: "ㄴ", chosenAt: 1 });
    expect(events.map((event) => event.type)).toEqual(["GLYPH_DUEL_SNAPSHOT", "GLYPH_TURN_CHOICE_LOCKED", "GLYPH_TURN_CHOICE_LOCKED", "GLYPH_TURN_RESOLVED", "GLYPH_DUEL_SNAPSHOT"]);
    expect(events.at(-1)).toMatchObject({ type: "GLYPH_DUEL_SNAPSHOT", turn: 2 });
  });
});
