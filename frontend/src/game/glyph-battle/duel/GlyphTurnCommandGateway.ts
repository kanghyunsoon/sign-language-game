import type { GlyphTurnMatchTransport } from "./GlyphTurnMatchTransport";

/** Sends a recognition-confirmed choice without calculating match results locally. */
export class GlyphTurnCommandGateway {
  constructor(private readonly matchId: string, private readonly transport: GlyphTurnMatchTransport, private readonly now: () => number = () => Date.now()) {}
  choose(symbol: string, turn: number): void {
    if (!symbol.trim()) throw new Error("지문자를 선택해야 합니다.");
    if (!Number.isSafeInteger(turn) || turn < 1) throw new Error("유효한 턴이 필요합니다.");
    this.transport.send({ type:"GLYPH_TURN_CHOICE_COMMAND", commandId:crypto.randomUUID(), matchId:this.matchId, turn, symbol, chosenAt:this.now() });
  }
}
