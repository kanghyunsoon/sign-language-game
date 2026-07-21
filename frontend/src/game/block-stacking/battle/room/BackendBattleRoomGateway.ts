import type { BattleRoomGateway } from "./BattleRoomGateway";
import { mapBackendCreateRoomRequest, mapRoomDetail, mapRoomListResponse, mapRoomSession } from "./roomMappers";
import { roomRequest } from "./roomRequest";
import type { BattleRoomDetail, BattleRoomGatewayOptions, BattleRoomSession, BattleRoomSummary, CreateRoomRequest } from "./roomTypes";

export class BackendBattleRoomGateway implements BattleRoomGateway {
  constructor(private readonly options: BattleRoomGatewayOptions) {}
  async getRooms(): Promise<readonly BattleRoomSummary[]> { return mapRoomListResponse(await roomRequest(this.options, ""), this.options.currentUser).filter((room) => room.gameType === "BLOCK_BATTLE"); }
  async createRoom(request: CreateRoomRequest): Promise<BattleRoomSession> {
    const payload = await roomRequest(this.options, "", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mapBackendCreateRoomRequest(request)) });
    return mapRoomSession(payload, this.options.currentUser);
  }
  async joinRoom(roomId: string): Promise<BattleRoomSession> { return mapRoomSession(await roomRequest(this.options, `/${encodeURIComponent(roomId)}/join`, { method: "POST" }), this.options.currentUser); }
  async getRoom(roomId: string): Promise<BattleRoomDetail> { return mapRoomDetail(await roomRequest(this.options, `/${encodeURIComponent(roomId)}`), this.options.currentUser); }
  async leaveRoom(roomId: string): Promise<void> { await roomRequest(this.options, `/${encodeURIComponent(roomId)}/leave`, { method: "POST" }); }
  async startGame(roomId: string): Promise<void> { await roomRequest(this.options, `/${encodeURIComponent(roomId)}/start`, { method: "POST" }); }
  async returnToWaiting(roomId: string): Promise<void> { await roomRequest(this.options, `/${encodeURIComponent(roomId)}/return-to-waiting`, { method: "POST" }); }
}
