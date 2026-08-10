import type { GameDataChannel } from "./GameDataChannel";
import type { BattleRoomDetail } from "../../block-stacking/battle/room";
import type { BattleMediaEventListener } from "./BattleMediaEvent";
import type { MediaConnectionState, RemoteGameParticipant } from "./mediaTypes";

export interface BattleMediaSession {
  connect(room: BattleRoomDetail, localStream: MediaStream): Promise<void>;
  syncParticipants(room: BattleRoomDetail): Promise<void>;
  disconnect(): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  getLocalStream(): MediaStream | null;
  getRemoteParticipants(): readonly RemoteGameParticipant[];
  getGameDataChannel?(): GameDataChannel | null;
  getConnectionState(): MediaConnectionState;
  isCameraEnabled(): boolean;
  subscribe(listener: BattleMediaEventListener): () => void;
}
