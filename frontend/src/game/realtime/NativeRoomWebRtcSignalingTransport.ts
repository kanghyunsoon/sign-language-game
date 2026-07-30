import type { WebRtcSignalingTransport } from "../media/signaling/WebRtcSignalingTransport";
import { parseWebRtcSignalingMessage } from "../media/signaling/WebRtcSignalingMessageParser";
import type { ClientRtcSignalingMessage, ServerRtcSignalingMessage } from "../media/signaling/WebRtcSignalingMessages";
import type { RoomRealtimeSocket } from "./RoomRealtimeSocket";

/** Maps the backend's {type:SIGNAL,payload} relay to the existing WebRTC domain port. */
export class NativeRoomWebRtcSignalingTransport implements WebRtcSignalingTransport {
  private readonly listeners = new Set<(message: ServerRtcSignalingMessage) => void>();
  private unsubscribeRoom: (() => void) | null = null;

  constructor(private readonly roomSocket: RoomRealtimeSocket) {}

  async connect(): Promise<void> {
    if (!this.unsubscribeRoom) {
      this.unsubscribeRoom = this.roomSocket.subscribe((message) => {
        if (message.type !== "SIGNAL") return;
        const parsed = parseWebRtcSignalingMessage(JSON.stringify(message.payload));
        for (const listener of this.listeners) listener(parsed);
      });
    }
    await this.roomSocket.connect();
  }

  send(message: ClientRtcSignalingMessage): void {
    this.roomSocket.sendSignal(message);
  }

  subscribe(listener: (message: ServerRtcSignalingMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  suspend(): void {
    // The room WebSocket is also the backend's participant-presence channel.
    // Keep it open after WebRTC is established so a browser refresh produces
    // the documented PEER_DISCONNECTED -> PEER_RECONNECTED lifecycle and so
    // either peer can signal a replacement RTCPeerConnection.
  }

  disconnect(): void {
    this.unsubscribeRoom?.();
    this.unsubscribeRoom = null;
    this.roomSocket.disconnect();
  }
}
