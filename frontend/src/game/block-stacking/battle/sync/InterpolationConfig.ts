export interface BattleSyncConfig {
  readonly transformPublishIntervalMs: number; readonly snapshotPublishIntervalMs: number; readonly interpolationDelayMs: number;
  readonly maxBufferedSnapshots: number; readonly snapDistanceThreshold: number; readonly snapAngleThreshold: number; readonly maxWebSocketBufferedAmount: number;
}
export const DEFAULT_BATTLE_SYNC_CONFIG: BattleSyncConfig = { transformPublishIntervalMs: 67, snapshotPublishIntervalMs: 1000, interpolationDelayMs: 100, maxBufferedSnapshots: 20, snapDistanceThreshold: 0.16, snapAngleThreshold: Math.PI / 2, maxWebSocketBufferedAmount: 256_000 };
