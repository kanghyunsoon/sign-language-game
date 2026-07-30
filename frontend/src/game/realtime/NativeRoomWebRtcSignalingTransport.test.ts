import { describe, expect, it, vi } from "vitest";

import { NativeRoomWebRtcSignalingTransport } from "./NativeRoomWebRtcSignalingTransport";
import type { RoomRealtimeSocket } from "./RoomRealtimeSocket";

describe("NativeRoomWebRtcSignalingTransport", () => {
  it("keeps the room presence socket open when WebRTC is established", async () => {
    const roomSocket = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(),
      disconnectForWebRtcHandoff: vi.fn(),
      sendSignal: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const transport = new NativeRoomWebRtcSignalingTransport(
      roomSocket as unknown as RoomRealtimeSocket,
    );

    await transport.connect();
    transport.suspend();

    expect(roomSocket.disconnectForWebRtcHandoff).not.toHaveBeenCalled();
    expect(roomSocket.disconnect).not.toHaveBeenCalled();
  });
});
