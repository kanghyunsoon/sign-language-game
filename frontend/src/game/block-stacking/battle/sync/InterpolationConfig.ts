export interface BattleSyncConfig {
  readonly transformPublishIntervalMs: number; readonly snapshotPublishIntervalMs: number; readonly interpolationDelayMs: number;
  readonly maxBufferedSnapshots: number; readonly snapDistanceThreshold: number; readonly snapAngleThreshold: number; readonly maxWebSocketBufferedAmount: number;
}
// Keep the remote board responsive without allowing stale transform samples to
// accumulate behind a busy video/MediaPipe frame.  Periodic snapshots also
// remove letters that were cleared while a transform packet was in flight.
export const DEFAULT_BATTLE_SYNC_CONFIG: BattleSyncConfig = { transformPublishIntervalMs: 16, snapshotPublishIntervalMs: 600, interpolationDelayMs: 80, maxBufferedSnapshots: 12, snapDistanceThreshold: 2, snapAngleThreshold: Math.PI, maxWebSocketBufferedAmount: 256_000 };
