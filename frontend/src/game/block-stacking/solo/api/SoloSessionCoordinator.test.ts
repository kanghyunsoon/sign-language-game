import { describe, expect, it, vi } from "vitest";

import { SoloSessionCoordinator } from "./SoloSessionCoordinator";
import type {
  CompleteSoloSessionRequest,
  SoloGameApi,
  SoloGameResult,
  StartSoloSessionRequest,
  StartSoloSessionResponse,
} from "./SoloGameApi";

const startRequest: StartSoloSessionRequest = { difficulty: "BEGINNER", symbolRange: ["ㄱ"], playMode: "AI" };
const session: StartSoloSessionResponse = { ...startRequest, soloSessionId: "session-1", userId: "user-1", startedAt: 1_000 };
const completion: CompleteSoloSessionRequest = { finalScore: 100, maxCombo: 1, removedSymbolCount: 1, playDurationMs: 1_000, symbolStatistics: [{ symbol: "ㄱ", correctCount: 1, incorrectCount: 0, confirmedCount: 1 }], endedAt: 2_000 };
const result: SoloGameResult = { ...completion, soloSessionId: "session-1", userId: "user-1", playMode: "AI", difficulty: "BEGINNER", startedAt: 1_000, awardedExp: 3 };

describe("SoloSessionCoordinator", () => {
  it("creates a server session before exposing an active game", async () => {
    const api = fakeApi();
    const coordinator = new SoloSessionCoordinator(api);

    await coordinator.start(startRequest);

    expect(api.startSession).toHaveBeenCalledWith(startRequest);
    expect(coordinator.getActiveSession()).toEqual(session);
  });

  it("keeps the game inactive when session start fails", async () => {
    const api = fakeApi();
    vi.mocked(api.startSession).mockRejectedValueOnce(new Error("offline"));
    const coordinator = new SoloSessionCoordinator(api);

    await expect(coordinator.start(startRequest)).rejects.toThrow("offline");

    expect(coordinator.getActiveSession()).toBeNull();
  });

  it("stores a successful completion and clears active state", async () => {
    const api = fakeApi();
    const coordinator = new SoloSessionCoordinator(api);
    await coordinator.start(startRequest);

    await expect(coordinator.complete(completion)).resolves.toEqual(result);

    expect(api.completeSession).toHaveBeenCalledWith("session-1", completion);
    expect(coordinator.getActiveSession()).toBeNull();
  });

  it("preserves a failed completion and retries the same request", async () => {
    const api = fakeApi();
    vi.mocked(api.completeSession).mockRejectedValueOnce(new Error("temporary failure"));
    const coordinator = new SoloSessionCoordinator(api);
    await coordinator.start(startRequest);

    await expect(coordinator.complete(completion)).rejects.toThrow("temporary failure");
    expect(coordinator.hasPendingCompletion()).toBe(true);
    await expect(coordinator.retryCompletion()).resolves.toEqual(result);

    expect(api.completeSession).toHaveBeenCalledTimes(2);
    expect(api.completeSession).toHaveBeenNthCalledWith(2, "session-1", completion);
    expect(coordinator.hasPendingCompletion()).toBe(false);
  });
});

function fakeApi(): SoloGameApi {
  return {
    startSession: vi.fn(async () => session),
    completeSession: vi.fn(async () => result),
    getResults: vi.fn(async () => [result]),
    getRank: vi.fn(async () => 1),
  };
}
