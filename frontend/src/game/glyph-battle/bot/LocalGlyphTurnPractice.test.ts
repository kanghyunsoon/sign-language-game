import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalGlyphTurnPractice } from "./LocalGlyphTurnPractice";

describe("LocalGlyphTurnPractice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });
  afterEach(() => vi.useRealTimers());

  it("waits for the user, locks one choice, then resolves exactly one simultaneous turn", async () => {
    const practice = new LocalGlyphTurnPractice({
      symbols: ["ㄱ", "ㅁ", "ㅗ", "ㅊ"],
      seed: 7,
    });
    expect(practice.getDuelView().phase).toBe("PLANNING");
    const symbol = practice.getSnapshot().attackHand[0]!;
    await practice.submitAttack({
      commandId: "turn-1",
      symbol,
      recognizedAt: 1_000,
    });
    expect(practice.getDuelView().phase).toBe("WAITING");
    expect(practice.getDuelView().callout).not.toMatch(/[ㄱㅁㅗㅊ]/);
    await expect(
      practice.submitAttack({
        commandId: "duplicate-turn",
        symbol: practice.getSnapshot().attackHand[0]!,
        recognizedAt: 1_001,
      }),
    ).rejects.toThrow("TURN_SELECTION_LOCKED");

    await vi.advanceTimersByTimeAsync(650);
    const reveal = practice.getDuelView();
    expect(reveal.phase).toBe("REVEAL");
    expect(reveal.turn).toBe(1);
    expect(reveal.resolvedMoves).toHaveLength(2);
    expect(reveal.local.health < 100 || reveal.opponent.health < 100).toBe(
      true,
    );

    await vi.advanceTimersByTimeAsync(1_600);
    const nextTurn = practice.getDuelView();
    expect(nextTurn.phase).toBe("PLANNING");
    expect(nextTurn.turn).toBe(2);
    expect(nextTurn.lastMove).toBeNull();
    expect(nextTurn.resolvedMoves).toEqual([]);
    practice.dispose();
  });

  it("keeps a generous planning deadline and resolves a safe fallback when time expires", async () => {
    const practice = new LocalGlyphTurnPractice({
      symbols: ["ㅋ", "ㅏ", "ㄱ", "ㅇ"],
      seed: 3,
      planningMs: 10_000,
    });
    expect(practice.getDuelView().turnEndsAt).toBe(11_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(practice.getDuelView().phase).toBe("WAITING");
    expect(practice.getDuelView().callout).toMatch(/시간 종료/);
    await vi.advanceTimersByTimeAsync(520);
    expect(practice.getDuelView().phase).toBe("REVEAL");
    practice.dispose();
  });

  it("applies one attack choice exactly once", async () => {
    const practice = new LocalGlyphTurnPractice({
      symbols: ["ㅂ", "ㅛ", "ㅌ"],
      seed: 4,
      forcedBotSymbol: "ㅛ",
    });
    await practice.submitAttack({
      commandId: "single-bieup",
      symbol: "ㅂ",
      recognizedAt: 1_000,
    });
    await vi.advanceTimersByTimeAsync(520);
    expect(practice.getDuelView().opponent.health).toBe(89);
    expect(practice.getDuelView().local.health).toBe(100);
    await vi.advanceTimersByTimeAsync(900);
    expect(practice.getDuelView().opponent.health).toBe(89);
    practice.dispose();
  });
});
