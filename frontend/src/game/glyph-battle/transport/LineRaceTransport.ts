import type { LineRaceClientCommand } from "../contracts";
import type { LineRaceServerEvent } from "../contracts";
import type { MatchConnectionOptions, MatchModuleTransport } from "../../match";
export type LineRaceConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
export interface LineRaceConnectionOptions extends MatchConnectionOptions {}
export type ClientLineRaceCommand = LineRaceClientCommand | {readonly type:"LINE_RACE_PLAYER_RECONNECTED"|"LINE_RACE_SNAPSHOT_REQUEST"|"LINE_RACE_PLAYER_FORFEIT_COMMAND";readonly commandId:string;readonly matchId:string};
export interface LineRaceTransport extends MatchModuleTransport<ClientLineRaceCommand, LineRaceServerEvent, LineRaceConnectionState, LineRaceConnectionOptions> {
  requestSnapshot(matchId:string):void;
}
export interface LineRaceTransportFactory { create(roomId:string):LineRaceTransport; }
