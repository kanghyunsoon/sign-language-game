import type {
  BattleRoomDetail,
  BattleRoomSession,
  BattleRoomSummary,
  CreateRoomRequest,
} from "./roomTypes";

export interface BattleRoomGateway {
  getRooms(): Promise<readonly BattleRoomSummary[]>;
  /** Discards the local lobby cache and requests a fresh authoritative SSE snapshot. */
  refreshRooms?(): Promise<readonly BattleRoomSummary[]>;
  subscribeRooms?(listener: (rooms: readonly BattleRoomSummary[]) => void, onError?: (error: Error) => void): () => void;
  createRoom(request: CreateRoomRequest): Promise<BattleRoomSession>;
  /** The deployed backend joins by roomCode, not by room id. */
  joinRoom(roomId: string): Promise<BattleRoomSession>;
  getRoom(roomId: string): Promise<BattleRoomDetail>;
  /** Keeps lobby-only display data in sync when room ownership changes. */
  updateRoomDisplayMetadata?(
    roomId: string,
    metadata: Pick<BattleRoomSummary, "title" | "hostName" | "difficulty" | "symbolRange">,
  ): void;
  setReady?(roomId: string, isReady: boolean): Promise<BattleRoomSession>;
  leaveRoom(roomId: string): Promise<void>;
  startGame(roomId: string): Promise<void>;
  /** Compatibility boundary only. The deployed backend closes completed rooms. */
  returnToWaiting(roomId: string): Promise<void>;
}
