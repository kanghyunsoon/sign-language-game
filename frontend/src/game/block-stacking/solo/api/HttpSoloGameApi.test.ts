import { describe, expect, it, vi } from "vitest";

import { HttpSoloGameApi, SoloGameApiError } from "./HttpSoloGameApi";
import type { CompleteSoloSessionRequest, StartSoloSessionRequest } from "./SoloGameApi";

const startRequest: StartSoloSessionRequest = {
  difficulty: "BEGINNER",
  symbolRange: ["ㄱ", "ㄴ"],
  playMode: "AI",
};
const completionRequest: CompleteSoloSessionRequest = {
  finalScore: 37,
  maxCombo: 2,
  removedSymbolCount: 1,
  playDurationMs: 36_250,
  symbolStatistics: [{ symbol: "ㄱ", correctCount: 1, incorrectCount: 0, confirmedCount: 1 }],
  endedAt: 2_000,
};

describe("HttpSoloGameApi", () => {
  it("keeps session setup local and reports only elapsed seconds", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ resultId: 8, score: 37 }, 201));
    const api = new HttpSoloGameApi({
      baseUrl: "/api",
      userId: "42",
      headers: { Authorization: "Bearer token" },
      fetcher,
      now: () => 1_000,
      createId: () => "session-1",
    });

    const session = await api.startSession(startRequest);
    const result = await api.completeSession(session.soloSessionId, completionRequest);

    expect(session).toMatchObject({ soloSessionId: "session-1", userId: "42", startedAt: 1_000 });
    expect(result).toMatchObject({ finalScore: 37, soloSessionId: "session-1" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/solo-results?userId=42", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ score: 37 }),
    }));
  });

  it("uses the official TETRIS_SOLO rank returned by the backend", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      top: [{ rank: 1, userId: 7, nickname: "수달", score: 21 }],
      me: { rank: 4, userId: 42, nickname: "나", score: 37 },
    }));
    const api = new HttpSoloGameApi({ baseUrl: "/api", userId: "42", fetcher });

    await expect(api.getRank()).resolves.toBe(4);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/rankings?userId=42&gameType=TETRIS_SOLO",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("returns null when the current user has no solo ranking", async () => {
    const api = new HttpSoloGameApi({
      userId: "42",
      fetcher: async () => jsonResponse({ top: [], me: null }),
    });

    await expect(api.getRank()).resolves.toBeNull();
  });

  it("rejects failed result storage instead of treating it as success", async () => {
    const api = new HttpSoloGameApi({
      userId: "42",
      fetcher: vi.fn(async () => new Response("failure", { status: 503 })),
      createId: () => "session-1",
    });
    await api.startSession(startRequest);

    await expect(api.completeSession("session-1", completionRequest)).rejects.toMatchObject({
      name: "SoloGameApiError",
      status: 503,
    } satisfies Partial<SoloGameApiError>);
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
