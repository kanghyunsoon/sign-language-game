import type { GameModuleUser } from "../../app/GameModule";
import type { BattleRoomDetail, BattleRoomSummary } from "../../block-stacking/battle/room";

export interface LineRaceRoomSummary extends BattleRoomSummary { readonly gameType: "LINE_RACE"; readonly visibility:"PUBLIC"|"PRIVATE";readonly roomCode:string|null;readonly matchDurationMs:number; }
export interface LineRaceRoomDetail extends BattleRoomDetail { readonly gameType: "LINE_RACE";readonly visibility:"PUBLIC"|"PRIVATE";readonly roomCode:string|null;readonly matchDurationMs:number; }
export interface LineRaceRoomSession extends LineRaceRoomDetail { readonly currentUser: GameModuleUser; }
export interface CreateLineRaceRoomOptions {
  readonly title: string; readonly visibility: "PUBLIC" | "PRIVATE";
  readonly matchDurationMs: number; readonly supportedSymbols: readonly string[];
}
export interface LineRaceRoomGatewayOptions {
  readonly baseUrl: string; readonly currentUser: GameModuleUser; readonly headers?: HeadersInit;
  readonly credentials?: RequestCredentials; readonly fetch?: typeof globalThis.fetch;
}
