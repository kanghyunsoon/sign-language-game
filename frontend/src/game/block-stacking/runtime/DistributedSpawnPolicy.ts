import type { PhysicsLetterState } from "../physics/types";

const MIN_LANES = 3;
const MAX_LANES = 7;

/**
 * Chooses a spawn lane from the current pile instead of repeatedly trusting a
 * random/server X coordinate. The preferred position is used only as a tie
 * breaker, so play stays varied without building a single vertical tower.
 */
export function chooseDistributedSpawnX(
  states: readonly PhysicsLetterState[],
  boardWidth: number,
  boardHeight: number,
  letterWidth: number,
  preferredNormalizedX: number,
): number {
  const safeWidth = Math.max(letterWidth, boardWidth);
  const laneCount = Math.max(MIN_LANES, Math.min(MAX_LANES, Math.floor(safeWidth / (letterWidth * 1.2))));
  const margin = Math.min(letterWidth / 2 + 4, safeWidth / 4);
  const usableWidth = Math.max(0, safeWidth - margin * 2);
  const candidates = Array.from({ length: laneCount }, (_, index) => (
    margin + usableWidth * (laneCount === 1 ? 0.5 : index / (laneCount - 1))
  ));
  const preferredX = Math.max(0, Math.min(1, preferredNormalizedX)) * safeWidth;
  const influenceRadius = Math.max(letterWidth * 0.9, safeWidth / laneCount * 0.72);

  return candidates
    .map((x) => ({
      x,
      // A high block is more dangerous than one resting near the floor. A
      // very large occupancy term prevents a busy lane winning on a tie.
      load: states.reduce((total, state) => {
        const distance = Math.abs(state.x - x);
        if (distance >= influenceRadius) return total;
        const proximity = 1 - distance / influenceRadius;
        const heightLoad = 1 + Math.max(0, boardHeight - state.y) / Math.max(1, boardHeight);
        return total + proximity * heightLoad;
      }, 0),
      preference: Math.abs(x - preferredX),
    }))
    .sort((left, right) => left.load - right.load || left.preference - right.preference || left.x - right.x)[0]!.x;
}
