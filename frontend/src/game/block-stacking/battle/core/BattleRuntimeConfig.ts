import { DEFAULT_BATTLE_SYNC_CONFIG, type BattleSyncConfig } from "../sync/InterpolationConfig";

export interface BattleRuntimeConfig {
  readonly boardWidth: number;
  readonly boardHeight: number;
  readonly dangerLineRatio: number;
  readonly spawnY: number;
  readonly removalEffectMs: number;
  readonly sync: BattleSyncConfig;
}

// A 1:1 board only occupies half of the shared stage, so it needs a smaller
// glyph than solo. Renderer, local/remote physics, tower-height sampling and
// danger-line checks all consume this value to keep the visual and collider
// sizes identical on both players' boards.
export const BATTLE_LETTER_SIZE = 160;
export const BATTLE_LETTER_COLOR = 0xc85e7a;
export const BATTLE_LETTER_SHADOW_COLOR = 0x704052;
// The visible finish line and the real 1:1 victory threshold must stay on the
// same coordinate. Reaching this line ends the round in the player's favour.
export const BATTLE_DANGER_LINE_Y = 160;
export const BATTLE_DANGER_LINE_RATIO = 1 / 6;
export const BATTLE_BURST_SPAWN_RATIO = 0.13;
export const DEFAULT_BATTLE_RUNTIME_CONFIG: BattleRuntimeConfig = { boardWidth: 720, boardHeight: 960, dangerLineRatio: BATTLE_DANGER_LINE_RATIO, spawnY: -70, removalEffectMs: 220, sync: DEFAULT_BATTLE_SYNC_CONFIG };
