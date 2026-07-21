export interface ObstaclePlacementOptions {
  readonly playerProgress: number;
  readonly raceLength: number;
  readonly leadDistance: number;
  readonly minimumSpacing: number;
  readonly existingCoursePositions: readonly number[];
  readonly requestedCoursePosition?: number;
}

export class ObstaclePlacementError extends Error {}

export class ObstaclePlacementPolicy {
  place(options: ObstaclePlacementOptions): number {
    if (options.requestedCoursePosition !== undefined && options.requestedCoursePosition <= options.playerProgress) {
      throw new ObstaclePlacementError("Obstacle cannot be placed at an already passed position.");
    }
    const minimum = options.playerProgress + options.leadDistance;
    let position = Math.max(minimum, options.requestedCoursePosition ?? minimum);
    const positions = [...options.existingCoursePositions].sort((a, b) => a - b);
    for (const existing of positions) {
      if (Math.abs(position - existing) < options.minimumSpacing) position = existing + options.minimumSpacing;
    }
    if (position <= options.playerProgress) throw new ObstaclePlacementError("Obstacle cannot be placed behind the runner.");
    if (position >= options.raceLength) throw new ObstaclePlacementError("No valid obstacle position remains before the finish line.");
    return position;
  }
}
