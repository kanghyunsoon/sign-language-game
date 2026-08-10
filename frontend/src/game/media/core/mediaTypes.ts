export type MediaConnectionState =
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "FAILED"
  | "DISCONNECTED";

export interface RemoteGameParticipant {
  readonly participantId: string;
  readonly displayName: string;
  readonly stream: MediaStream | null;
  readonly cameraEnabled: boolean;
  readonly connectionState: MediaConnectionState;
}

export interface LocalGameMediaState {
  readonly stream: MediaStream | null;
  readonly cameraEnabled: boolean;
  readonly connectionState: MediaConnectionState;
}
