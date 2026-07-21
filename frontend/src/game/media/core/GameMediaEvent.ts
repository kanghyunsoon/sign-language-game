import type { GameMediaPeerConnectionState, RemoteGameMediaParticipant } from "./GameMediaParticipant";
import type { GameMediaSessionState } from "./GameMediaSession";

export type GameMediaEvent =
  | { readonly type: "SESSION_STATE_CHANGED"; readonly state: GameMediaSessionState }
  | { readonly type: "PARTICIPANT_ADDED"; readonly participant: RemoteGameMediaParticipant }
  | { readonly type: "PARTICIPANT_REMOVED"; readonly userId: string }
  | { readonly type: "PARTICIPANT_CONNECTION_STATE_CHANGED"; readonly userId: string; readonly state: GameMediaPeerConnectionState }
  | { readonly type: "REMOTE_STREAM_UPDATED"; readonly userId: string; readonly stream: MediaStream }
  | { readonly type: "LOCAL_CAMERA_STATE_CHANGED"; readonly enabled: boolean }
  | { readonly type: "SIGNALING_ERROR"; readonly error: Error }
  | { readonly type: "PEER_CONNECTION_ERROR"; readonly userId: string; readonly error: Error };

export type GameMediaEventListener = (event: GameMediaEvent) => void;
