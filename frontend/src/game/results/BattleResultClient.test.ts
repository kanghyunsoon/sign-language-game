import { describe, expect, it, vi } from "vitest";
import { BattleResultClient, BattleResultRequestError } from "./BattleResultClient";

describe("BattleResultClient", () => {
  it.each(["42", 84, null] as const)("reports the authoritative winner user ID %s", async (winnerUserId) => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ winnerUserId: winnerUserId === null ? null : Number(winnerUserId) }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });
    const client = new BattleResultClient({
      apiBaseUrl: "/api", userId: "42", headers: { Authorization: "Bearer a" }, fetcher,
    });
    await expect(client.reportResult(7, winnerUserId)).resolves.toEqual({
      winnerUserId: winnerUserId === null ? null : Number(winnerUserId),
    });
    expect(calls[0]?.url).toBe("/api/game-rooms/7/results?userId=42");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      winnerUserId: winnerUserId === null ? null : Number(winnerUserId),
    });
  });

  it("preserves a 409 as a room-lifecycle conflict", async () => {
    const client = new BattleResultClient({
      apiBaseUrl: "/api",
      userId: "42",
      fetcher: vi.fn(async () => new Response(null, { status: 409 })),
    });

    await expect(client.reportResult(7, "42")).rejects.toMatchObject({
      name: "BattleResultRequestError", status: 409, responseBody: null,
    } satisfies Partial<BattleResultRequestError>);
  });

  it("still rejects non-idempotent server failures", async () => {
    const client = new BattleResultClient({
      apiBaseUrl: "/api",
      userId: "42",
      fetcher: vi.fn(async () => new Response(null, { status: 500 })),
    });

    await expect(client.reportResult(7, "42")).rejects.toThrow("Battle result request failed (500).");
  });

  it("rejects a non-numeric winner ID before sending the request", async () => {
    const fetcher = vi.fn();
    const client = new BattleResultClient({ apiBaseUrl: "/api", userId: "42", fetcher });

    await expect(client.reportResult(7, "guest")).rejects.toThrow("Invalid winnerUserId.");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
