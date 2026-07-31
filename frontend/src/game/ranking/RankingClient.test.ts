import { describe, expect, it, vi } from "vitest";
import { RankingClient } from "./RankingClient";

describe("RankingClient", () => {
  it("returns top five and the current user's independent rank", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      top: [{ rank: 1, userId: 1, nickname: "수달왕", score: 9, playDurationMs: 10_000 }],
      me: { rank: 12, userId: 42, nickname: "나", score: 2, playDurationMs: 30_000 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new RankingClient({
      apiBaseUrl: "/api", userId: "42", gameType: "TETRIS_SOLO", headers: { Authorization: "Bearer a" }, fetcher,
    });
    await expect(client.get({ cache: "no-store" })).resolves.toEqual({
      top: [{ rank: 1, userId: 1, nickname: "수달왕", score: 9, playDurationMs: 10_000 }],
      me: { rank: 12, userId: 42, nickname: "나", score: 2, playDurationMs: 30_000 },
    });
    expect(fetcher).toHaveBeenCalledWith("/api/rankings?userId=42&gameType=TETRIS_SOLO", expect.objectContaining({
      cache: "no-store",
      credentials: "include",
      headers: { Authorization: "Bearer a" },
    }));
  });
});
