export interface BattleSyncConfig {
  readonly transformPublishIntervalMs: number; readonly snapshotPublishIntervalMs: number; readonly interpolationDelayMs: number;
  readonly maxBufferedSnapshots: number; readonly snapDistanceThreshold: number; readonly snapAngleThreshold: number; readonly maxWebSocketBufferedAmount: number;
  /** Stream only the latest owner-authoritative moving transforms. */
  readonly publishMovingTransforms: boolean;
}
// The owner publishes a compact transform sample at 15 Hz. The remote board
// renders at 60 Hz with a short interpolation delay and never runs a second
// Matter simulation for the same board.
export const DEFAULT_BATTLE_SYNC_CONFIG: BattleSyncConfig = {
  transformPublishIntervalMs: 1000 / 15,
  snapshotPublishIntervalMs: 1_500,
  interpolationDelayMs: 100,
  maxBufferedSnapshots: 6,
  snapDistanceThreshold: 2,
  snapAngleThreshold: Math.PI,
  maxWebSocketBufferedAmount: 32_000,
  publishMovingTransforms: true,
};
