import type { BattleRoomGateway } from "./BattleRoomGateway";
import { mapDevCreateRoomRequest, mapRoomDetail, mapRoomListResponse, mapRoomSession } from "./roomMappers";
import { roomRequest } from "./roomRequest";
import type { BattleRoomDetail, BattleRoomGatewayOptions, BattleRoomSession, BattleRoomSummary, CreateRoomRequest } from "./roomTypes";

export class DevBattleRoomGateway implements BattleRoomGateway {
  constructor(private readonly options: BattleRoomGatewayOptions) {}
  async getRooms(): Promise<readonly BattleRoomSummary[]> {
    return mapRoomListResponse(await roomRequest(this.options, "/rooms"), this.options.currentUser).filter((room) => room.gameType === "BLOCK_BATTLE");
  }
  async createRoom(request: CreateRoomRequest): Promise<BattleRoomSession> {
    const payload = await roomRequest(this.options, "/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mapDevCreateRoomRequest(request)) });
    return mapRoomSession(payload, this.options.currentUser);
  }
  async joinRoom(roomId: string): Promise<BattleRoomSession> {
    return mapRoomSession(await roomRequest(this.options, `/rooms/${encodeURIComponent(roomId)}/join`, { method: "POST" }), this.options.currentUser);
  }
  async getRoom(roomId: string): Promise<BattleRoomDetail> {
    return mapRoomDetail(await roomRequest(this.options, `/rooms/${encodeURIComponent(roomId)}`), this.options.currentUser);
  }
  async leaveRoom(roomId: string): Promise<void> { await roomRequest(this.options, `/rooms/${encodeURIComponent(roomId)}/leave`, { method: "POST" }); }
  async startGame(roomId: string): Promise<void> { await roomRequest(this.options, `/rooms/${encodeURIComponent(roomId)}/start`, { method: "POST" }); }
  async returnToWaiting(roomId: string): Promise<void> { await roomRequest(this.options, `/rooms/${encodeURIComponent(roomId)}/return-to-waiting`, { method: "POST" }); }
}
