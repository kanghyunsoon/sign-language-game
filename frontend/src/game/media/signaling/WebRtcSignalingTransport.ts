import type { ClientRtcSignalingMessage, ServerRtcSignalingMessage } from "./WebRtcSignalingMessages";

export interface WebRtcSignalingTransport {
  connect(): Promise<void>;
  send(message: ClientRtcSignalingMessage): void;
  subscribe(listener: (message: ServerRtcSignalingMessage) => void): () => void;
  disconnect(): void;
}
