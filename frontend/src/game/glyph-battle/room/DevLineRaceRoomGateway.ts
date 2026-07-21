import { roomRequest } from "../../block-stacking/battle/room/roomRequest";
import type { LineRaceRoomGateway } from "./LineRaceRoomGateway";
import { mapLineRaceCreateRequest, mapLineRaceRoom, mapLineRaceRoomList, mapLineRaceSession } from "./lineRaceRoomMappers";
import type { CreateLineRaceRoomOptions, LineRaceRoomGatewayOptions } from "./lineRaceRoomTypes";
export class DevLineRaceRoomGateway implements LineRaceRoomGateway {
  constructor(private readonly options: LineRaceRoomGatewayOptions) {}
  async getRooms(){return mapLineRaceRoomList(await roomRequest(this.options,"/rooms?gameType=LINE_RACE"),this.options.currentUser);}
  async createRoom(request:CreateLineRaceRoomOptions){return mapLineRaceSession(await roomRequest(this.options,"/rooms",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(mapLineRaceCreateRequest(request))}),this.options.currentUser);}
  async joinRoom(id:string){return mapLineRaceSession(await roomRequest(this.options,`/rooms/${encodeURIComponent(id)}/join`,{method:"POST"}),this.options.currentUser);}
  async joinByCode(code:string){return mapLineRaceSession(await roomRequest(this.options,"/rooms/join-by-code",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({roomCode:code.trim()})}),this.options.currentUser);}
  async getRoom(id:string){return mapLineRaceRoom(await roomRequest(this.options,`/rooms/${encodeURIComponent(id)}`),this.options.currentUser);}
  async leaveRoom(id:string){await roomRequest(this.options,`/rooms/${encodeURIComponent(id)}/leave`,{method:"POST"});}
  async startGame(id:string){await roomRequest(this.options,`/rooms/${encodeURIComponent(id)}/start`,{method:"POST"});}
  async returnToWaiting(id:string){await roomRequest(this.options,`/rooms/${encodeURIComponent(id)}/return-to-waiting`,{method:"POST"});}
}
