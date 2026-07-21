import type { CreateLineRaceRoomOptions, LineRaceRoomDetail, LineRaceRoomSession, LineRaceRoomSummary } from "./lineRaceRoomTypes";
export interface LineRaceRoomGateway {
  getRooms(): Promise<readonly LineRaceRoomSummary[]>;
  createRoom(request: CreateLineRaceRoomOptions): Promise<LineRaceRoomSession>;
  joinRoom(roomId: string): Promise<LineRaceRoomSession>;
  joinByCode(roomCode: string): Promise<LineRaceRoomSession>;
  getRoom(roomId: string): Promise<LineRaceRoomDetail>;
  leaveRoom(roomId: string): Promise<void>;
  startGame(roomId: string): Promise<void>;
  returnToWaiting(roomId: string): Promise<void>;
}
