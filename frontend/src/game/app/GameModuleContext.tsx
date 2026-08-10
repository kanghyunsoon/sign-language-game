import { createContext, useContext } from "react";

import type { GameModuleConfig, GameModuleUser } from "./GameModule";
import type { GameModuleServices } from "../contracts/GameModuleServices";
import type { SharedGameCameraSession } from "../media/camera/SharedGameCameraSession";
import type { BattleMediaSession } from "../media/core/BattleMediaSession";
import type { BattleRoomSession } from "../block-stacking/battle/room";
import type { LineRaceRoomSession } from "../glyph-battle/room";
import type { LineRaceTransport } from "../glyph-battle/transport";
import type { ActivePlayerSession } from "../recognition/active-player";
import type { GlyphTurnMatchTransport } from "../glyph-battle/duel/GlyphTurnMatchTransport";
import type { BattleGameTransport } from "../block-stacking/battle/transport/BattleGameTransport";

export interface GameModuleContextValue {
  readonly user: GameModuleUser;
  readonly accessToken?: string;
  readonly config: GameModuleConfig;
  readonly services: GameModuleServices;
  readonly battleMediaSession: BattleMediaSession;
  readonly lineRaceMediaSession?: BattleMediaSession;
  /** Legacy test-only port. Production composition does not provide it. */
  readonly lineRaceTransport?: LineRaceTransport;
  readonly glyphTurnTransport?: GlyphTurnMatchTransport;
  /** P2P block-stacking transport (host authority over the WebRTC DataChannel). */
  readonly battleGameTransport?: BattleGameTransport;
  readonly sharedCameraSession: SharedGameCameraSession;
  readonly activePlayerSession?: ActivePlayerSession;
  readonly battleRoomSession: BattleRoomSession | null;
  readonly setBattleRoomSession: (session: BattleRoomSession | null) => void;
  readonly turnBattleRoomSession?: BattleRoomSession | null;
  readonly setTurnBattleRoomSession?: (session: BattleRoomSession | null) => void;
  readonly lineRaceRoomSession?: LineRaceRoomSession | null;
  readonly setLineRaceRoomSession?: (session: LineRaceRoomSession | null) => void;
  readonly onExit?: () => void;
}

export const GameModuleContext = createContext<GameModuleContextValue | null>(null);

export function useGameModuleContext(): GameModuleContextValue {
  const value = useContext(GameModuleContext);
  if (value === null) throw new Error("GameModule components must be rendered inside GameServiceProvider.");
  return value;
}
