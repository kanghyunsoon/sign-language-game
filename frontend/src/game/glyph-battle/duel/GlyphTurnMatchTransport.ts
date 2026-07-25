import type { MatchConnectionOptions, MatchModuleTransport } from "../../match";
import type { GlyphTurnChoiceCommand, GlyphTurnServerEvent } from "./GlyphTurnMatchContract";

export type GlyphTurnConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
export interface GlyphTurnConnectionOptions extends MatchConnectionOptions { readonly matchId: string; readonly hostPlayerId?: string; readonly playerIds?: readonly string[]; }
export interface GlyphTurnMatchTransport extends MatchModuleTransport<GlyphTurnChoiceCommand, GlyphTurnServerEvent, GlyphTurnConnectionState, GlyphTurnConnectionOptions> { requestSnapshot(matchId:string):void }
export interface GlyphTurnMatchTransportFactory { create(roomId:string):GlyphTurnMatchTransport }
