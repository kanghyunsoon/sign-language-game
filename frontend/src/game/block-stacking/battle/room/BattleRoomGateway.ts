import type {
  BattleRoomDetail,
  BattleRoomSession,
  BattleRoomSummary,
  CreateRoomRequest,
} from "./roomTypes";

export interface BattleRoomGateway {
  getRooms(): Promise<readonly BattleRoomSummary[]>;
  subscribeRooms?(listener: (rooms: readonly BattleRoomSummary[]) => void, onError?: (error: Error) => void): () => void;
  createRoom(request: CreateRoomRequest): Promise<BattleRoomSession>;
  /** The deployed backend joins by roomCode, not by room id. */
  joinRoom(roomId: string): Promise<BattleRoomSession>;
  getRoom(roomId: string): Promise<BattleRoomDetail>;
  setReady?(roomId: string, isReady: boolean): Promise<BattleRoomSession>;
  leaveRoom(roomId: string): Promise<void>;
  startGame(roomId: string): Promise<void>;
  /** Compatibility boundary only. The deployed backend closes completed rooms. */
  returnToWaiting(roomId: string): Promise<void>;
}
