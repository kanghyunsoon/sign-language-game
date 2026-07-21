import type { TraversalRunnerPosition } from "./RaceLaneRenderer";

export function clampRunnerToLane(
  position: TraversalRunnerPosition,
  laneY: number,
  trackStart: number,
  trackEnd: number,
): TraversalRunnerPosition {
  return {
    x: Math.max(trackStart + 36, Math.min(trackEnd - 36, position.x)),
    y: Math.max(laneY - 22, Math.min(laneY + 22, position.y)),
    rotation: Math.max(-.12, Math.min(.12, position.rotation)),
  };
}
