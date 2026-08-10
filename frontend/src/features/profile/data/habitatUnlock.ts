export const HABITAT_UNLOCK_LEVELS = [5, 10, 15, 20] as const;

export type HabitatUnlockLevel = (typeof HABITAT_UNLOCK_LEVELS)[number];

export function findNewlyUnlockedHabitatLevel(
  previousLevel: number,
  currentLevel: number,
): HabitatUnlockLevel | null {
  return (
    [...HABITAT_UNLOCK_LEVELS]
      .reverse()
      .find(
        (unlockLevel) =>
          previousLevel < unlockLevel && unlockLevel <= currentLevel,
      ) ?? null
  );
}
