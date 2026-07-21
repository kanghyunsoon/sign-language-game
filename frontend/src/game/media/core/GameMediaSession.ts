import type { GameMediaEventListener } from "./GameMediaEvent";
import type { GameMediaParticipantInfo, RemoteGameMediaParticipant } from "./GameMediaParticipant";
import type { WebRtcSignalingTransport } from "../signaling/WebRtcSignalingTransport";

export type GameMediaSessionState = "IDLE" | "CONNECTING" | "CONNECTED" | "PARTIALLY_CONNECTED" | "FAILED" | "CLOSED";

export interface GameMediaConnectOptions {
  readonly roomId: string;
  readonly localUserId: string;
  readonly localDisplayName: string;
  readonly localStream: MediaStream;
  readonly participants: readonly GameMediaParticipantInfo[];
  readonly signalingTransport: WebRtcSignalingTransport;
  readonly iceServers: readonly RTCIceServer[];
}

export interface GameMediaSession {
  connect(options: GameMediaConnectOptions): Promise<void>;
  syncParticipants(participants: readonly GameMediaParticipantInfo[]): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  getLocalStream(): MediaStream | null;
  getRemoteParticipants(): readonly RemoteGameMediaParticipant[];
  getParticipant(userId: string): RemoteGameMediaParticipant | undefined;
  getConnectionState(): GameMediaSessionState;
  subscribe(listener: GameMediaEventListener): () => void;
  disconnect(): Promise<void>;
}
