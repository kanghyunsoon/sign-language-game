import { describe, expect, it } from "vitest";

import { consumeBattleRefreshExit, markBattlePageUnload } from "./BattleRefreshExit";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe("BattleRefreshExit", () => {
  it("turns a fresh reload of the same battle into a terminal room exit", () => {
    const storage = memoryStorage();
    const now = Date.now();
    markBattlePageUnload("42", storage);
    expect(consumeBattleRefreshExit("42", "reload", now + 1_000, storage)).toBe(true);
    expect(consumeBattleRefreshExit("42", "reload", now + 1_001, storage)).toBe(false);
  });

  it("does not exit on ordinary SPA navigation or for another room", () => {
    const storage = memoryStorage();
    markBattlePageUnload("42", storage);
    expect(consumeBattleRefreshExit("42", "navigate", Date.now(), storage)).toBe(false);
    markBattlePageUnload("42", storage);
    expect(consumeBattleRefreshExit("99", "reload", Date.now(), storage)).toBe(false);
  });
});
