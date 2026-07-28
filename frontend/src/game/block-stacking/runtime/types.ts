import type { GameConfig } from "../core/types";
import type { PhysicsWorld } from "../physics/types";
import type { GameRenderer } from "../render/types";
import type { ScoringConfig } from "../scoring/types";

export type GameRunState = "IDLE" | "RUNNING" | "PAUSED" | "GAME_OVER";

export interface SoloGameConfig {
  readonly boardWidth: number;
  readonly boardHeight: number;
  /** While false, letters are released only after the player matches the paper target. */
  readonly autoDropEnabled: boolean;
  readonly spawnIntervalMs: number;
  readonly spawnTopPadding: number;
  readonly spawnHorizontalPadding: number;
  readonly dangerLineY: number;
  readonly letterHeight: number;
}

export const DEFAULT_SOLO_GAME_CONFIG: SoloGameConfig = {
  boardWidth: 720,
  boardHeight: 960,
  autoDropEnabled: true,
  spawnIntervalMs: 1850,
  spawnTopPadding: 48,
  spawnHorizontalPadding: 56,
  dangerLineY: 160,
  letterHeight: 140,
};

export interface GameRuntimeSnapshot {
  readonly runState: GameRunState;
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly removedCount: number;
  readonly playTimeMs: number;
  readonly activeLetterCount: number;
  readonly lockedSymbol: string | null;
  /** The symbol currently waiting on the otter's paper in manual-drop mode. */
  readonly queuedSymbol: string | null;
  /** Increments whenever a paper symbol is released, so the UI can replay its burst. */
  readonly paperBurstVersion: number;
  readonly paperBurstSymbol: string | null;
  readonly lastMessage: string;
}

export interface GameRuntimeOptions {
  readonly physics: () => PhysicsWorld;
  readonly renderer: GameRenderer;
  readonly symbols: readonly string[];
  readonly gameConfig?: GameConfig;
  readonly soloConfig?: Partial<SoloGameConfig>;
  readonly scoringConfig?: Partial<ScoringConfig>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
}

export type GameRuntimeListener = (snapshot: GameRuntimeSnapshot) => void;
