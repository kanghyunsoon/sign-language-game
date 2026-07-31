import { describe, expect, it, vi } from "vitest";
import { RealtimeTicketClient } from "./RealtimeTicketClient";

describe("RealtimeTicketClient", () => {
  it("issues a fresh one-use ticket with bearer authentication and userId", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ticket: "one-use",
      expiresInSeconds: 30,
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const client = new RealtimeTicketClient({
      apiBaseUrl: "/api/",
      userId: "42",
      headers: { Authorization: "Bearer access" },
      fetcher,
    });

    await expect(client.issue()).resolves.toEqual({
      ticket: "one-use",
      expiresInSeconds: 30,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/auth/sse-ticket?userId=42", expect.objectContaining({
      method: "POST",
      credentials: "include",
      headers: { Authorization: "Bearer access" },
    }));
  });

  it("rejects malformed ticket responses", async () => {
    const client = new RealtimeTicketClient({
      apiBaseUrl: "/api", userId: "42",
      fetcher: vi.fn(async () => new Response("{}", { status: 201 })),
    });
    await expect(client.issue()).rejects.toThrow("Invalid realtime ticket response");
  });

  it("rejects non-integer ticket expiry values outside the Swagger int64 contract", async () => {
    const client = new RealtimeTicketClient({
      apiBaseUrl: "/api", userId: "42",
      fetcher: vi.fn(async () => new Response(JSON.stringify({
        ticket: "one-use",
        expiresInSeconds: 30.5,
      }), { status: 201, headers: { "Content-Type": "application/json" } })),
    });
    await expect(client.issue()).rejects.toThrow("Invalid realtime ticket response");
  });
});
