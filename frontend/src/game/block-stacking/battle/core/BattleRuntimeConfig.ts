import { DEFAULT_BATTLE_SYNC_CONFIG, type BattleSyncConfig } from "../sync/InterpolationConfig";

export interface BattleRuntimeConfig {
  readonly boardWidth: number;
  readonly boardHeight: number;
  readonly dangerLineRatio: number;
  readonly spawnY: number;
  readonly removalEffectMs: number;
  readonly sync: BattleSyncConfig;
}

export const BATTLE_LETTER_SIZE = 88;
export const BATTLE_DANGER_LINE_Y = 104;
export const BATTLE_DANGER_LINE_RATIO = 0.22;
export const DEFAULT_BATTLE_RUNTIME_CONFIG: BattleRuntimeConfig = { boardWidth: 720, boardHeight: 960, dangerLineRatio: BATTLE_DANGER_LINE_RATIO, spawnY: -70, removalEffectMs: 220, sync: DEFAULT_BATTLE_SYNC_CONFIG };
