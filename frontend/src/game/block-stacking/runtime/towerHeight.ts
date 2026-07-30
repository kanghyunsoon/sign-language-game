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

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
