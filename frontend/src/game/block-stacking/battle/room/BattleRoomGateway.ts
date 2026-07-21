import type {
  BattleRoomDetail,
  BattleRoomSession,
  BattleRoomSummary,
  CreateRoomRequest,
} from "./roomTypes";

export interface BattleRoomGateway {
  getRooms(): Promise<readonly BattleRoomSummary[]>;
  createRoom(request: CreateRoomRequest): Promise<BattleRoomSession>;
  joinRoom(roomId: string): Promise<BattleRoomSession>;
  getRoom(roomId: string): Promise<BattleRoomDetail>;
  leaveRoom(roomId: string): Promise<void>;
  startGame(roomId: string): Promise<void>;
  returnToWaiting(roomId: string): Promise<void>;
}
