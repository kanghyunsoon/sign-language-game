import { describe, expect, it, vi } from "vitest";

import { softenTetrisWeight, TetrisWeightApi } from "./TetrisWeightApi";

describe("TetrisWeightApi", () => {
  it("maps sign ids to labels and applies only a mild capped bias", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/wrong-answers/tetris-weights?")) {
        return Response.json([
          { signId: 5, weight: 1.4 },
          { signId: 6, weight: 1 },
          { signId: 7, weight: 3 },
        ]);
      }
      if (url.includes("category=CONSONANT")) {
        return Response.json([{ id: 5, label: "ㄱ" }, { id: 7, label: "ㄴ" }]);
      }
      return Response.json([{ id: 6, label: "ㅏ" }]);
    });
    const api = new TetrisWeightApi({
      baseUrl: "/api",
      userId: "42",
      fetcher,
      headers: { Authorization: "Bearer token" },
    });

    await expect(api.getSymbolWeights()).resolves.toEqual({
      "ㄱ": 1.08,
      "ㅏ": 1,
      "ㄴ": 1.2,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/wrong-answers/tetris-weights?userId=42",
      expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
    );
  });

  it("falls back to uniform runtime weights when any request fails", async () => {
    const api = new TetrisWeightApi({
      userId: "42",
      fetcher: vi.fn(async () => new Response(null, { status: 503 })),
    });

    await expect(api.getSymbolWeights()).resolves.toEqual({});
  });

  it("never increases the effective bias beyond twenty percent", () => {
    expect(softenTetrisWeight(1)).toBe(1);
    expect(softenTetrisWeight(1.4)).toBeCloseTo(1.08);
    expect(softenTetrisWeight(100)).toBe(1.2);
  });
});
