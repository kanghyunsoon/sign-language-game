import type { PhysicsLetterState } from "../physics/types";

export interface RendererConfig {
  readonly width: number;
  readonly height: number;
  /**
   * Optional fixed simulation space. Physics positions are expressed in this
   * space and projected into the current renderer viewport.
   */
  readonly coordinateWidth?: number;
  readonly coordinateHeight?: number;
  readonly dangerLineY: number;
  readonly dangerLineRatio: number;
  readonly letterWidth: number;
  readonly letterHeight: number;
  readonly removalHighlightDurationMs: number;
  readonly showScenery: boolean;
}

export const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  width: 720,
  height: 960,
  dangerLineY: 160,
  dangerLineRatio: 1 / 6,
  letterWidth: 140,
  letterHeight: 140,
  removalHighlightDurationMs: 180,
  showScenery: true,
};

export interface RemovalEffectFinishedEvent {
  readonly type: "REMOVAL_EFFECT_FINISHED";
  readonly id: string;
}

/**
 * A rendering-only contract. Callers retain responsibility for game rules,
 * Matter body lifecycle, and the requestAnimationFrame loop.
 */
export interface GameRenderer {
  resize(width: number, height: number): void;
  render(letters: readonly PhysicsLetterState[]): void;
  highlightRemoval(id: string, durationMs?: number): void;
  /** Plays the visual transition for a letter released from the otter paper. */
  startSpawnEffect(id: string): void;
  /** Temporarily hides the Pixi copy while its foreground hand-off copy is shown. */
  setLetterVisible?(id: string, visible: boolean): void;
  setTarget(id: string | null): void;
  updateEffects(deltaMs: number): readonly RemovalEffectFinishedEvent[];
  clear(): void;
  destroy(): void;
}
