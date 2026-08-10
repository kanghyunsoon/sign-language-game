import { describe, expect, it } from "vitest";
import { HttpGameResultRepository } from "./HttpGameResultRepository";
import { LocalGameResultRepository, type StorageLike } from "./LocalGameResultRepository";
import { ResilientGameResultRepository } from "./ResilientGameResultRepository";
import type { GameResultSubmission } from "./types";

const submission: GameResultSubmission = { mode: "PYTHON_AI", score: 120, maxCombo: 3, removedCount: 4, durationSeconds: 30, playedAt: "2026-07-14T00:00:00.000Z", symbolStatistics: [{ symbol: "A", targetCount: 2, confirmedCount: 2, correctCount: 1, incorrectCount: 1, averageConfidence: 0.8 }] };
class MemoryStorage implements StorageLike { private values = new Map<string, string>(); getItem(key: string) { return this.values.get(key) ?? null; } setItem(key: string, value: string) { this.values.set(key, value); } }

describe("game result repositories", () => {
  it("stores and aggregates local results without video or landmark data", async () => { const repository = new LocalGameResultRepository(new MemoryStorage()); await repository.save(submission); const saved = await repository.listMine(); expect(saved).toHaveLength(1); expect(saved[0]).not.toHaveProperty("landmarks"); expect(await repository.getMySignStatistics()).toEqual(submission.symbolStatistics); });
  it("sends the documented HTTP request without a body user id", async () => { let request: RequestInit | undefined; const repository = new HttpGameResultRepository({ fetcher: async (_url, init) => { request = init; return new Response(JSON.stringify({ ...submission, id: "r1" }), { status: 201 }); }, baseUrl: "/api", headers: { "X-User-Id": "authenticated-user" } }); await repository.save(submission); expect(new Headers(request?.headers).get("X-User-Id")).toBe("authenticated-user"); expect(String(request?.body)).not.toContain("userId"); });
  it("resolves current authentication headers for every request", async () => { let token = "first"; const values: string[] = []; const repository = new HttpGameResultRepository({ fetcher: async (_url, init) => { values.push(new Headers(init?.headers).get("Authorization") ?? ""); return new Response("[]"); }, credentials: "include", headers: () => ({ Authorization: `Bearer ${token}` }) }); await repository.listMine(); token = "second"; await repository.listMine(); expect(values).toEqual(["Bearer first", "Bearer second"]); });
  it("falls back to local storage when the HTTP API is unavailable", async () => { const offline = new HttpGameResultRepository({ fetcher: async () => { throw new Error("offline"); } }); const local = new LocalGameResultRepository(new MemoryStorage()); const repository = new ResilientGameResultRepository(offline, local); await repository.save(submission); expect(await repository.listMine()).toHaveLength(1); });
});
