import { describe, expect, it } from "vitest";

import { RemovalSystem } from "./RemovalSystem";

function system(inputLockEnabled = true): RemovalSystem {
  return new RemovalSystem({
    inputLock: { enabled: inputLockEnabled, cooldownMs: 100, allowDifferentSymbolSwitch: true },
  });
}

function removingId(events: readonly { readonly type: string; readonly letter?: { readonly id: string } }[]): string | undefined {
  return events.find((event) => event.type === "LETTER_REMOVING")?.letter?.id;
}

describe("RemovalSystem", () => {
  it("prioritizes SETTLED letters over FALLING letters for the same symbol", () => {
    const game = system();
    game.spawnLetter("falling", "ㄱ", 1);
    game.spawnLetter("settled", "ㄱ", 2);
    game.settleLetter("settled", 3);
    expect(removingId(game.confirmSymbol("ㄱ", 10))).toBe("settled");
  });

  it("chooses the earliest spawned settled letter even when it settled again later", () => {
    const game = system();
    game.spawnLetter("first-spawned", "ㄱ", 1);
    game.spawnLetter("later-spawned", "ㄱ", 2);
    game.settleLetter("first-spawned", 3);
    game.settleLetter("later-spawned", 4);
    game.resumeLetter("first-spawned", 5);
    game.settleLetter("first-spawned", 6);
    expect(removingId(game.confirmSymbol("ㄱ", 30))).toBe("first-spawned");
  });

  it("falls back to the earliest FALLING letter when no settled letter exists", () => {
    const game = system();
    game.spawnLetter("first", "ㄴ", 1);
    game.spawnLetter("second", "ㄴ", 2);
    expect(removingId(game.confirmSymbol("ㄴ", 10))).toBe("first");
  });

  it("does not select the same letter twice after it enters REMOVING", () => {
    const game = system(false);
    game.spawnLetter("only", "ㄷ", 1);
    expect(removingId(game.confirmSymbol("ㄷ", 10))).toBe("only");
    expect(game.confirmSymbol("ㄷ", 11).map((event) => event.type)).toEqual(["INPUT_LOCKED", "REMOVAL_SKIPPED"]);
  });

  it("skips stale queue IDs through lazy deletion", () => {
    const game = system(false);
    game.spawnLetter("first", "ㄹ", 1);
    game.spawnLetter("second", "ㄹ", 2);
    game.settleLetter("first", 3);
    game.settleLetter("second", 4);
    game.confirmSymbol("ㄹ", 10);
    game.completeRemoval("first", 11);
    expect(game.queueSnapshot("ㄹ").settledIds).toEqual(["first", "second"]);
    expect(removingId(game.confirmSymbol("ㄹ", 12))).toBe("second");
  });

  it("blocks the same confirmed symbol even after cooldown until hand release", () => {
    const game = system();
    game.spawnLetter("first", "ㅁ", 1);
    game.spawnLetter("second", "ㅁ", 2);
    expect(removingId(game.confirmSymbol("ㅁ", 10))).toBe("first");
    expect(game.confirmSymbol("ㅁ", 1000)[0]?.type).toBe("INPUT_REJECTED");
    game.handReleased(1001);
    expect(removingId(game.confirmSymbol("ㅁ", 1002))).toBe("second");
  });
});
