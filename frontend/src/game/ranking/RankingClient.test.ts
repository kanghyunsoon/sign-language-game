import { describe, expect, it, vi } from "vitest";
import { RankingClient } from "./RankingClient";

describe("RankingClient", () => {
  it("returns top five and the current user's independent rank", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      top: [{ rank: 1, userId: 1, nickname: "수달왕", winCount: 9, lossCount: 1 }],
      me: { rank: 12, userId: 42, nickname: "나", winCount: 2, lossCount: 3 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const client = new RankingClient({
      apiBaseUrl: "/api", userId: "42", headers: { Authorization: "Bearer a" }, fetcher,
    });
    await expect(client.get()).resolves.toEqual({
      top: [{ rank: 1, userId: 1, nickname: "수달왕", winCount: 9, lossCount: 1 }],
      me: { rank: 12, userId: 42, nickname: "나", winCount: 2, lossCount: 3 },
    });
    expect(fetcher).toHaveBeenCalledWith("/api/rankings?userId=42", expect.objectContaining({
      credentials: "include",
      headers: { Authorization: "Bearer a" },
    }));
  });
});
