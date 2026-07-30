import { describe, expect, it } from "vitest";
import { LocalSoloGameApi } from "./LocalSoloGameApi";

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("LocalSoloGameApi", () => {
  it("stores a completed solo score locally without a backend request", async () => {
    const storage = new MemoryStorage();
    const api = new LocalSoloGameApi({ userId: "user-1", storage, now: () => 100, createId: () => "solo-1" });
    const session = await api.startSession({ difficulty: "BEGINNER", symbolRange: ["ㄱ"], playMode: "AI" });
    await api.completeSession(session.soloSessionId, {
      finalScore: 120,
      maxCombo: 3,
      removedSymbolCount: 4,
      playDurationMs: 30_000,
      symbolStatistics: [],
      endedAt: 130,
    });
    await expect(new LocalSoloGameApi({ userId: "user-1", storage }).getResults()).resolves.toMatchObject([
      { soloSessionId: "solo-1", userId: "user-1", finalScore: 120 },
    ]);
  });
});