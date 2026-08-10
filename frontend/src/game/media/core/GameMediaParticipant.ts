export interface GameMediaParticipantInfo {
  readonly userId: string;
  readonly displayName: string;
  readonly cameraEnabled: boolean;
}

export type GameMediaPeerConnectionState =
  | "NEW"
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "FAILED"
  | "CLOSED";

export interface RemoteGameMediaParticipant extends GameMediaParticipantInfo {
  readonly stream: MediaStream | null;
  readonly connectionState: GameMediaPeerConnectionState;
}
