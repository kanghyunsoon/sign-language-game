import type { PhysicsLetterState } from "../physics/types";

/**
 * Maps the topmost physical glyph to the playable space below the danger
 * line.  Zero means an empty board; one means the stack has reached danger.
 */
export function towerHeightRatio(
  states: readonly PhysicsLetterState[],
  boardHeight: number,
  dangerLineY: number,
  letterHeight: number,
): number {
  if (states.length === 0 || boardHeight <= dangerLineY) return 0;
  const topY = Math.min(...states.map((state) => state.y - letterHeight / 2));
  return clamp((boardHeight - topY) / (boardHeight - dangerLineY));
}

/**
 * Holds the previously painted level while Matter bodies are moving. This
 * keeps a falling glyph or a collapsing tower from moving the gauge until the
 * board has settled into its next stable shape.
 */
export function settledTowerHeightRatio(
  previousRatio: number,
  states: readonly PhysicsLetterState[],
  boardHeight: number,
  dangerLineY: number,
  letterHeight: number,
): number {
  if (states.length === 0) return 0;
  if (states.some((state) => !state.settled)) return previousRatio;
  return towerHeightRatio(states, boardHeight, dangerLineY, letterHeight);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
