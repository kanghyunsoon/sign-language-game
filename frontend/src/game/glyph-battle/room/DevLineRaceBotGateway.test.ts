import { afterEach, describe, expect, it, vi } from "vitest";
import { BackendDevLineRaceBotGateway } from "./DevLineRaceBotGateway";

afterEach(() => vi.unstubAllGlobals());

describe("BackendDevLineRaceBotGateway", () => {
  it("creates and stops a real dev server bot match through the dev API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            roomId: "room",
            matchId: "match",
            botPlayerId: "bot",
            difficulty: "HARD",
            randomSeed: 12345,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = new BackendDevLineRaceBotGateway({
      baseUrl: "/api/dev",
      currentUser: { userId: "user", displayName: "Developer" },
    });

    await expect(gateway.create("HARD", 60_000)).resolves.toMatchObject({
      matchId: "match",
      botPlayerId: "bot",
    });
    await gateway.stop("match");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/dev/line-race/bot-matches",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/dev/line-race/bot-matches/match",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
