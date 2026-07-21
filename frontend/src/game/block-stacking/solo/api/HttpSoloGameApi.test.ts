import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpSoloGameApi, SoloGameApiError } from "./HttpSoloGameApi";
import type { CompleteSoloSessionRequest, StartSoloSessionRequest } from "./SoloGameApi";

const startRequest: StartSoloSessionRequest = { difficulty: "BEGINNER", symbolRange: ["ㄱ", "ㄴ"], playMode: "AI" };
const completionRequest: CompleteSoloSessionRequest = {
  finalScore: 120,
  maxCombo: 2,
  removedSymbolCount: 1,
  playDurationMs: 30_000,
  symbolStatistics: [{ symbol: "ㄱ", correctCount: 1, incorrectCount: 0, confirmedCount: 1 }],
  endedAt: 2_000,
};
const startResponse = { ...startRequest, soloSessionId: "session-1", userId: "user-1", startedAt: 1_000 };
const resultResponse = { ...completionRequest, soloSessionId: "session-1", userId: "user-1", playMode: "AI" as const, difficulty: "BEGINNER", startedAt: 1_000 };

afterEach(() => vi.unstubAllGlobals());

describe("HttpSoloGameApi", () => {
  it("binds the native fetch function to globalThis", async () => {
    vi.stubGlobal("fetch", function (this: unknown) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(jsonResponse(startResponse, 201));
    });
    const api = new HttpSoloGameApi();

    await expect(api.startSession(startRequest)).resolves.toMatchObject({ soloSessionId: "session-1" });
  });

  it("starts a session without adding a body user id", async () => {
    let receivedUrl = "";
    let receivedInit: RequestInit | undefined;
    const api = new HttpSoloGameApi({
      baseUrl: "/api",
      headers: { "X-Dev-User-Id": "user-1" },
      fetcher: async (url, init) => {
        receivedUrl = String(url);
        receivedInit = init;
        return jsonResponse(startResponse, 201);
      },
    });

    const response = await api.startSession(startRequest);

    expect(receivedUrl).toBe("/api/game/solo/sessions");
    expect(JSON.parse(String(receivedInit?.body))).toEqual(startRequest);
    expect(String(receivedInit?.body)).not.toContain("userId");
    expect(response.soloSessionId).toBe("session-1");
  });

  it("maps a completed result and symbol statistics", async () => {
    const api = new HttpSoloGameApi({ fetcher: async () => jsonResponse(resultResponse) });

    const result = await api.completeSession("session-1", completionRequest);

    expect(result.finalScore).toBe(120);
    expect(result.symbolStatistics).toEqual(completionRequest.symbolStatistics);
  });

  it("rejects failed result storage instead of treating it as success", async () => {
    const api = new HttpSoloGameApi({ fetcher: vi.fn(async () => new Response("failure", { status: 503 })) });

    await expect(api.completeSession("session-1", completionRequest)).rejects.toMatchObject({
      name: "SoloGameApiError",
      status: 503,
    } satisfies Partial<SoloGameApiError>);
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
