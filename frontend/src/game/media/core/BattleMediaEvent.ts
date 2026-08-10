import type { MediaConnectionState, RemoteGameParticipant } from "./mediaTypes";

export type BattleMediaEvent =
  | {
      readonly type: "CONNECTION_STATE_CHANGED";
      readonly connectionState: MediaConnectionState;
    }
  | {
      readonly type: "LOCAL_CAMERA_CHANGED";
      readonly enabled: boolean;
    }
  | {
      readonly type: "REMOTE_PARTICIPANTS_CHANGED";
      readonly participants: readonly RemoteGameParticipant[];
    }
  | {
      readonly type: "ERROR";
      readonly error: Error;
    };

export type BattleMediaEventListener = (event: BattleMediaEvent) => void;
