export interface BattleSyncConfig {
  readonly transformPublishIntervalMs: number; readonly snapshotPublishIntervalMs: number; readonly interpolationDelayMs: number;
  readonly maxBufferedSnapshots: number; readonly snapDistanceThreshold: number; readonly snapAngleThreshold: number; readonly maxWebSocketBufferedAmount: number;
  /**
   * The battle screen simulates confirmed opponent spawns locally. Streaming
   * moving transforms in that mode only congests the RTC channel and can never
   * improve the rendered board.
   */
  readonly publishMovingTransforms: boolean;
}
// Keep the remote board responsive without allowing stale transform samples to
// accumulate behind a busy video/MediaPipe frame.  Periodic snapshots also
// remove letters that were cleared while a transform packet was in flight.
export const DEFAULT_BATTLE_SYNC_CONFIG: BattleSyncConfig = {
  transformPublishIntervalMs: 50,
  snapshotPublishIntervalMs: 2_000,
  interpolationDelayMs: 80,
  maxBufferedSnapshots: 8,
  snapDistanceThreshold: 2,
  snapAngleThreshold: Math.PI,
  maxWebSocketBufferedAmount: 64_000,
  publishMovingTransforms: false,
};
