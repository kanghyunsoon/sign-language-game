export interface ActivePlayerMatchWeights { readonly position: number; readonly boundingBox: number; readonly pose: number; readonly motion: number; readonly appearance: number; }
export interface ActivePlayerConfig {
  readonly temporaryLostGraceMs: number; readonly reidentificationTimeoutMs: number; readonly minimumRegistrationDurationMs: number;
  readonly minimumLockScore: number; readonly ambiguityScoreDifference: number; readonly maximumTrackedPeople: number; readonly maximumMissedFrames: number;
  readonly minimumPoseVisibility: number; readonly maximumMatchCost: number; readonly matchingWeights: ActivePlayerMatchWeights;
  readonly maximumRegistrationVelocity: number; readonly minimumRegistrationPoseSimilarity: number;
}
export const DEFAULT_ACTIVE_PLAYER_CONFIG: ActivePlayerConfig = Object.freeze({
  temporaryLostGraceMs: 1500, reidentificationTimeoutMs: 5000, minimumRegistrationDurationMs: 700,
  minimumLockScore: .72, ambiguityScoreDifference: .05, maximumTrackedPeople: 4, maximumMissedFrames: 24,
  minimumPoseVisibility: .35, maximumMatchCost: .82,
  maximumRegistrationVelocity: .004, minimumRegistrationPoseSimilarity: .88,
  matchingWeights: Object.freeze({ position: .25, boundingBox: .2, pose: .25, motion: .15, appearance: .15 }),
});
export function validateActivePlayerConfig(config: ActivePlayerConfig): ActivePlayerConfig {
  if (!Number.isInteger(config.maximumTrackedPeople) || config.maximumTrackedPeople < 1 || config.maximumTrackedPeople > 4) throw new RangeError("maximumTrackedPeople must be between 1 and 4.");
  if (!Number.isInteger(config.maximumMissedFrames) || config.maximumMissedFrames < 1) throw new RangeError("maximumMissedFrames must be positive.");
  if (config.minimumLockScore < 0 || config.minimumLockScore > 1 || config.ambiguityScoreDifference < 0) throw new RangeError("Active player scores are invalid.");
  const sum = Object.values(config.matchingWeights).reduce((total, value) => total + value, 0);
  if (Math.abs(sum - 1) > 1e-6) throw new RangeError("Matching weights must total 1.");
  return config;
}
