import type { SoloGameApi } from "../block-stacking/solo/api";
import type { BattleRoomGateway } from "../block-stacking/battle/room";
import type { BattleGameTransportFactory } from "../block-stacking/battle/transport/BattleGameTransport";
import type { LineRaceRoomGateway } from "../glyph-battle/room";
import type { DevLineRaceBotGateway } from "../glyph-battle/room";
import type { LineRaceTransportFactory } from "../glyph-battle/transport";
import type { GlyphTurnMatchTransportFactory } from "../glyph-battle/duel/GlyphTurnMatchTransport";
import type { RecognitionVisionAdapterFactory } from "../recognition/vision";

import type { RoomRealtimeSocket } from "../realtime";
export type { SoloGameApi } from "../block-stacking/solo/api";
export type { BattleRoomGateway, BattleRoomSummary } from "../block-stacking/battle/room";

export type { BattleGameTransport, BattleGameTransportFactory } from "../block-stacking/battle/transport/BattleGameTransport";

export interface GameModuleServices {
  readonly soloGameApi: SoloGameApi;
  readonly battleRoomGateway: BattleRoomGateway;
  readonly turnBattleRoomGateway?: BattleRoomGateway;
  readonly roomRealtimeSocketFactory?: { create(roomId: string, initialTicket?: string): RoomRealtimeSocket };
  readonly battleGameTransportFactory: BattleGameTransportFactory;
  readonly lineRaceRoomGateway?: LineRaceRoomGateway;
  readonly lineRaceBotGateway?: DevLineRaceBotGateway;
  readonly lineRaceTransportFactory?: LineRaceTransportFactory;
  readonly glyphTurnMatchTransportFactory?: GlyphTurnMatchTransportFactory;
  /** Replaces browser MediaPipe for every recognition camera in this module. */
  readonly recognitionVisionAdapterFactory?: RecognitionVisionAdapterFactory;
}
