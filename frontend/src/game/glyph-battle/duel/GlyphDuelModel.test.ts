import { describe, expect, it } from "vitest";
import { getGlyphCombatRule } from "./GlyphCombatRules";
import { GlyphDuelModel } from "./GlyphDuelModel";

const attack = (
  id: string,
  symbol: string,
  attacker = "me",
  target = "you",
  at = 1000,
) => ({
  type: "LINE_RACE_ATTACK_ACCEPTED" as const,
  eventId: `a-${id}`,
  matchId: "m",
  sequence: 1,
  occurredAt: at,
  attackerPlayerId: attacker,
  targetPlayerId: target,
  consumedSymbol: symbol,
  combo: 1,
  obstacle: {
    obstacleId: id,
    templateId: "t",
    symbol,
    attackerPlayerId: attacker,
    targetPlayerId: target,
    coursePosition: 1,
    penaltyMs: 1,
    createdAt: at,
    warningEndsAt: at + 1,
    counterDeadlineAt: at + 2,
    status: "WARNING" as const,
  },
});
const hit = (id: string, playerId = "you", at = 2000) => ({
  type: "LINE_RACE_TRAVERSAL_STARTED" as const,
  eventId: `h-${id}`,
  matchId: "m",
  sequence: 2,
  occurredAt: at,
  obstacleId: id,
  playerId,
  templateId: "t",
  traversalStartedAt: at,
  traversalFinishAt: at + 1,
});

describe("GlyphDuelModel", () => {
  it("resolves an attack and returns to simultaneous planning", () => {
    const model = new GlyphDuelModel("me");
    model.ingest(attack("1", "ㄱ"));
    expect(model.getView().phase).toBe("WAITING");
    model.ingest(hit("1"));
    expect(model.getView().opponent.health).toBe(88);
    expect(model.getView().phase).toBe("PLANNING");
  });
  it("does not reveal an opponent choice before resolution", () => {
    const model = new GlyphDuelModel("me");
    model.ingest(attack("1", "ㅊ", "you", "me"));
    expect(model.getView().callout).toBe("상대 선택 완료");
    expect(model.getView().callout).not.toContain("ㅊ");
  });
  it("turns a successful counter into focus and percentage guard", () => {
    const model = new GlyphDuelModel("me");
    model.ingest(attack("1", "ㅊ"));
    model.ingest({
      type: "LINE_RACE_COUNTER_SUCCEEDED",
      eventId: "c",
      matchId: "m",
      sequence: 2,
      occurredAt: 1600,
      playerId: "you",
      obstacleId: "1",
      symbol: "ㅊ",
      counterAt: 1600,
    });
    expect(model.getView().opponent.health).toBe(100);
    expect(model.getView().opponent.focus).toBe(20);
    expect(model.getView().opponent.guardPercent).toBe(25);
  });
  it("scales attacks while support cards do not add a second hit", () => {
    expect(getGlyphCombatRule("ㄱ")).toMatchObject({
      difficulty: 1,
      damage: 12,
    });
    expect(getGlyphCombatRule("ㄹ")).toMatchObject({
      difficulty: 2,
      damage: 14,
    });
    expect(getGlyphCombatRule("ㅋ")).toMatchObject({
      difficulty: 3,
      role: "GUARD",
      damage: 0,
    });
    expect(getGlyphCombatRule("ㅛ")).toMatchObject({
      role: "FOCUS",
      damage: 0,
    });
  });
  it("restores the server-authoritative snapshot without locally calculating combat", () => {
    const model = new GlyphDuelModel("me");
    expect(
      model.ingestGlyphTurn({
        type: "GLYPH_DUEL_SNAPSHOT",
        eventId: "70000000-0000-4000-8000-000000000001",
        matchId: "m",
        sequence: 8,
        occurredAt: 3000,
        serverTime: 3000,
        turn: 4,
        turnEndsAt: 13000,
        phase: "PLANNING",
        lockedPlayerIds: ["you"],
        fighters: [
          {
            playerId: "me",
            health: 73,
            focus: 41,
            guardPercent: 18,
            rounds: 1,
          },
          { playerId: "you", health: 56, focus: 9, guardPercent: 0, rounds: 0 },
        ],
      }),
    ).toBe(true);
    expect(model.getView()).toMatchObject({
      turn: 4,
      turnEndsAt: 13000,
      phase: "PLANNING",
      local: { health: 73, focus: 41, guardPercent: 18, rounds: 1 },
      opponent: { health: 56, focus: 9, guardPercent: 0, rounds: 0 },
    });
  });
  it("keeps a locked opponent choice private until resolution", () => {
    const model = new GlyphDuelModel("me");
    model.ingestGlyphTurn({
      type: "GLYPH_TURN_CHOICE_LOCKED",
      eventId: "70000000-0000-4000-8000-000000000001",
      matchId: "m",
      sequence: 1,
      occurredAt: 1000,
      turn: 1,
      turnEndsAt: 11000,
      playerId: "you",
    });
    expect(model.getView().callout).toBe("상대 선택 완료");
    expect(model.getView().callout).not.toContain("ㅊ");
  });
  it("does not replay the resolved server turn after the next planning snapshot", () => {
    const model = new GlyphDuelModel("me");
    model.ingestGlyphTurn({
      type: "GLYPH_TURN_RESOLVED",
      eventId: "70000000-0000-4000-8000-000000000010",
      matchId: "m",
      sequence: 10,
      occurredAt: 2_000,
      turn: 1,
      choices: [
        {
          playerId: "me",
          symbol: "ㅂ",
          role: "ATTACK",
          damage: 14,
          shieldGained: 0,
          focusDelta: 10,
          effectiveness: "NEUTRAL",
        },
        {
          playerId: "you",
          symbol: "ㅌ",
          role: "GUARD",
          damage: 0,
          shieldGained: 49,
          focusDelta: 8,
          effectiveness: "NEUTRAL",
        },
      ],
      fighters: [
        { playerId: "me", health: 100, focus: 10, guardPercent: 0, rounds: 0 },
        { playerId: "you", health: 91, focus: 8, guardPercent: 49, rounds: 0 },
      ],
    });
    expect(model.getView().phase).toBe("REVEAL");
    expect(model.getView().lastMove?.symbol).toBe("ㅂ");
    model.ingestGlyphTurn({
      type: "GLYPH_DUEL_SNAPSHOT",
      eventId: "70000000-0000-4000-8000-000000000011",
      matchId: "m",
      sequence: 11,
      occurredAt: 3_500,
      serverTime: 3_500,
      turn: 2,
      turnEndsAt: 13_500,
      phase: "PLANNING",
      lockedPlayerIds: [],
      fighters: [
        { playerId: "me", health: 100, focus: 10, guardPercent: 0, rounds: 0 },
        { playerId: "you", health: 91, focus: 8, guardPercent: 0, rounds: 0 },
      ],
    });
    expect(model.getView().lastMove).toBeNull();
    expect(model.getView().resolvedMoves).toEqual([]);
  });
});
