import { describe, expect, it, vi } from "vitest";
import { RoomRealtimeSocket, type RoomWebSocketLike } from "./RoomRealtimeSocket";
import { RealtimeTicketRequestError } from "./RealtimeTicketClient";

class FakeSocket implements RoomWebSocketLike {
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { readonly data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  open(): void { this.readyState = 1; this.onopen?.(); }
  drop(): void { this.readyState = 3; this.onclose?.(); }
}

describe("RoomRealtimeSocket", () => {
  it("connects with a fresh query ticket and sends only SIGNAL envelopes", async () => {
    const socket = new FakeSocket();
    const issue = vi.fn(async () => ({ ticket: "once", expiresInSeconds: 30 }));
    const createWebSocket = vi.fn(() => socket);
    const client = new RoomRealtimeSocket({
      webSocketBaseUrl: "wss://host/api/ws/game-rooms/",
      roomId: "7",
      localUserId: "42",
      ticketClient: { issue },
      createWebSocket,
    });

    const connecting = client.connect();
    await vi.waitFor(() => expect(createWebSocket).toHaveBeenCalledTimes(1));
    socket.open();
    await connecting;
    client.sendSignal({ type: "RTC_OFFER", roomId: "7", connectionId: "c1" });

    expect(createWebSocket).toHaveBeenCalledWith("wss://host/api/ws/game-rooms/7?ticket=once");
    expect(JSON.parse(String(socket.send.mock.calls[0]?.[0]))).toEqual({
      type: "SIGNAL",
      payload: {
        type: "RTC_OFFER", roomId: "7", connectionId: "c1", senderUserId: "42",
      },
    });
  });

  it("keeps the documented presence socket open after WebRTC handoff", async () => {
    const socket = new FakeSocket();
    const client = new RoomRealtimeSocket({
      webSocketBaseUrl: "ws://host/ws/game-rooms",
      roomId: "7", localUserId: "42",
      ticketClient: { issue: async () => ({ ticket: "a", expiresInSeconds: 30 }) },
      createWebSocket: () => socket,
    });
    const connecting = client.connect();
    await vi.waitFor(() => expect(socket.onopen).not.toBeNull());
    socket.open();
    await connecting;
    client.disconnectForWebRtcHandoff();
    expect(socket.send).not.toHaveBeenCalled();
    expect(socket.close).not.toHaveBeenCalled();
  });

  it("does not report a stale connection error after the handshake succeeds", async () => {
    const socket = new FakeSocket();
    const client = new RoomRealtimeSocket({
      webSocketBaseUrl: "ws://host/ws/game-rooms", roomId: "7", localUserId: "42",
      ticketClient: { issue: async () => ({ ticket: "a", expiresInSeconds: 30 }) },
      createWebSocket: () => socket,
    });
    const reportError = vi.fn();
    client.subscribeError(reportError);

    const connecting = client.connect();
    await vi.waitFor(() => expect(socket.onopen).not.toBeNull());
    socket.open();
    await connecting;
    socket.onerror?.();

    expect(reportError).not.toHaveBeenCalled();
  });

  it("requires a new ticket for a signaling reconnect", async () => {
    const available = [new FakeSocket(), new FakeSocket()];
    const created: FakeSocket[] = [];
    const issue = vi.fn()
      .mockResolvedValueOnce({ ticket: "first", expiresInSeconds: 30 })
      .mockResolvedValueOnce({ ticket: "second", expiresInSeconds: 30 });
    const client = new RoomRealtimeSocket({
      webSocketBaseUrl: "ws://host/ws/game-rooms", roomId: "7", localUserId: "42",
      ticketClient: { issue }, createWebSocket: () => {
        const socket = available.shift()!;
        created.push(socket);
        return socket;
      },
    });
    const first = client.connect(); await vi.waitFor(() => expect(created).toHaveLength(1)); created[0]!.open(); await first;
    client.disconnect();
    const second = client.connect(); await vi.waitFor(() => expect(created).toHaveLength(2)); created[1]!.open(); await second;
    expect(issue).toHaveBeenCalledTimes(2);
  });

  it("automatically reconnects an unexpectedly closed presence socket with a fresh ticket", async () => {
    const available = [new FakeSocket(), new FakeSocket()];
    const created: FakeSocket[] = [];
    const issue = vi.fn()
      .mockResolvedValueOnce({ ticket: "first", expiresInSeconds: 30 })
      .mockResolvedValueOnce({ ticket: "second", expiresInSeconds: 30 });
    const client = new RoomRealtimeSocket({
      webSocketBaseUrl: "ws://host/ws/game-rooms",
      roomId: "7",
      localUserId: "42",
      ticketClient: { issue },
      createWebSocket: () => {
        const socket = available.shift()!;
        created.push(socket);
        return socket;
      },
    });

    const initial = client.connect();
    await vi.waitFor(() => expect(created).toHaveLength(1));
    created[0]!.open();
    await initial;
    created[0]!.drop();

    await vi.waitFor(() => expect(created).toHaveLength(2));
    expect(issue).toHaveBeenCalledTimes(2);
    created[1]!.open();
  });

  it("does not retry a rejected identity or one-time ticket", async () => {
    const issue = vi.fn(async () => { throw new RealtimeTicketRequestError(401); });
    const client = new RoomRealtimeSocket({
      webSocketBaseUrl: "ws://host/ws/game-rooms", roomId: "7", localUserId: "42",
      ticketClient: { issue }, createWebSocket: vi.fn(),
    });

    await expect(client.connect()).rejects.toThrow("Realtime ticket request failed (401).");
    expect(issue).toHaveBeenCalledOnce();
  });

  it("stops transient retries at the absolute reconnect deadline", async () => {
    let now = 0;
    const issue = vi.fn(async () => { throw new Error("temporary network failure"); });
    const wait = vi.fn(async (delayMs: number) => { now += delayMs; });
    const client = new RoomRealtimeSocket({
      webSocketBaseUrl: "ws://host/ws/game-rooms",
      roomId: "7",
      localUserId: "42",
      ticketClient: { issue },
      createWebSocket: vi.fn(),
      reconnectBudgetMs: 1_000,
      now: () => now,
      wait,
    });

    await expect(client.connect()).rejects.toThrow("temporary network failure");

    expect(now).toBe(1_000);
    expect(issue).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.flat()).toEqual([300, 600, 100]);
  });

  it.each(["PEER_DISCONNECTED", "PEER_RECONNECTED"] as const)("accepts the documented backend %s event", async (type) => {
    const socket = new FakeSocket();
    const client = new RoomRealtimeSocket({
      webSocketBaseUrl: "ws://host/ws/game-rooms", roomId: "7", localUserId: "42",
      ticketClient: { issue: async () => ({ ticket: "a", expiresInSeconds: 30 }) },
      createWebSocket: () => socket,
    });
    const received = vi.fn();
    client.subscribe(received);
    const connecting = client.connect();
    await vi.waitFor(() => expect(socket.onopen).not.toBeNull());
    socket.open();
    await connecting;
    socket.onmessage?.({ data: JSON.stringify({ type, payload: { userId: 84, isReady: true } }) });
    expect(received).toHaveBeenCalledWith({ type, payload: { userId: 84, isReady: true } });
  });
});
