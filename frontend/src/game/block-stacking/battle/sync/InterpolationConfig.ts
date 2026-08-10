export interface BattleSyncConfig {
  readonly transformPublishIntervalMs: number; readonly snapshotPublishIntervalMs: number; readonly interpolationDelayMs: number;
  readonly maxBufferedSnapshots: number; readonly maxExtrapolationMs: number; readonly snapDistanceThreshold: number; readonly snapAngleThreshold: number; readonly maxWebSocketBufferedAmount: number;
  /** Stream only the latest owner-authoritative moving transforms. */
  readonly publishMovingTransforms: boolean;
}
// Only moving glyphs are mirrored. A 30 Hz stream lets the remote board render
// at display refresh rate without sending the whole settled tower every frame.
export const DEFAULT_BATTLE_SYNC_CONFIG: BattleSyncConfig = {
  transformPublishIntervalMs: 1000 / 30,
  // Snapshots are still sent immediately when a glyph settles or disappears.
  // The low-frequency fallback is solely for recovery, so it must not grow
  // with every long-running tower.
  snapshotPublishIntervalMs: 5_000,
  interpolationDelayMs: 140,
  maxBufferedSnapshots: 6,
  maxExtrapolationMs: 70,
  snapDistanceThreshold: 2,
  snapAngleThreshold: Math.PI,
  maxWebSocketBufferedAmount: 12_000,
  publishMovingTransforms: true,
};
