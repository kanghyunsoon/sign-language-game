import { describe, expect, it, vi } from "vitest";
import { NativeWebSocketBattleTransport, type BattleWebSocketLike } from "./NativeWebSocketBattleTransport";

class FakeSocket implements BattleWebSocketLike {
  readyState = 0; bufferedAmount = 0; onopen: (() => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null; onmessage: ((event: { readonly data: string }) => void) | null = null; send = vi.fn(); close = vi.fn(() => this.onclose?.());
}

describe("NativeWebSocketBattleTransport", () => {
  it("publishes independent game connection states", async () => { const socket = new FakeSocket(); const states: string[] = []; const transport = new NativeWebSocketBattleTransport(() => socket); transport.subscribeConnectionState((state) => states.push(state)); const connecting = transport.connect({ url: "ws://localhost/game", roomId: "room", playerId: "player" }); socket.onopen?.(); await connecting; expect(states).toEqual(["DISCONNECTED", "CONNECTING", "CONNECTED"]); socket.onclose?.(); expect(states.at(-1)).toBe("DISCONNECTED"); });
  it("allows a new socket for the same session after disconnect", async () => { const firstSocket = new FakeSocket(); const secondSocket = new FakeSocket(); let calls = 0; const transport = new NativeWebSocketBattleTransport(() => calls++ === 0 ? firstSocket : secondSocket); const options = { url: "ws://localhost/game", roomId: "room", playerId: "player" }; const first = transport.connect(options); firstSocket.onopen?.(); await first; firstSocket.onclose?.(); const second = transport.connect(options); secondSocket.onopen?.(); await second; expect(transport.getConnectionState()).toBe("CONNECTED"); });
});
