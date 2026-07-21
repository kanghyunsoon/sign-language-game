import { describe, expect, it, vi } from "vitest";
import { WebSocketWebRtcSignalingTransport, type SignalingStompClient } from "./WebSocketWebRtcSignalingTransport";

describe("WebSocketWebRtcSignalingTransport", () => {
  it("reuses the game STOMP endpoint, private RTC queue, and cleans its subscription", async () => {
    let connected: (() => void) | undefined;
    let receive: ((frame: { body: string }) => void) | undefined;
    const unsubscribe = vi.fn();
    const client = {
      connect: vi.fn((_headers, callback) => { connected = callback; }),
      disconnect: vi.fn(),
      subscribe: vi.fn((_destination, listener) => { receive = listener; return { unsubscribe }; }),
      send: vi.fn(),
    } as unknown as SignalingStompClient;
    const transport = new WebSocketWebRtcSignalingTransport({ url: "ws://game/ws/game", localUserId: "local", createClient: () => client });
    const listener = vi.fn();
    transport.subscribe(listener);
    const pending = transport.connect();
    connected?.();
    await pending;
    expect(client.subscribe).toHaveBeenCalledWith("/queue/game/rtc/local", expect.any(Function));
    transport.send({ type: "RTC_PARTICIPANT_SNAPSHOT", roomId: "room", connectionId: "c", sequence: 1, sentAt: 1, payload: {} });
    expect(client.send).toHaveBeenCalledWith("/app/game/rtc/message", {}, expect.any(String));
    receive?.({ body: JSON.stringify({ type: "RTC_PEER_LEFT", roomId: "room", senderUserId: "remote", connectionId: "c", sequence: 1, sentAt: 1, payload: { userId: "remote" } }) });
    expect(listener).toHaveBeenCalledTimes(1);
    transport.disconnect();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
