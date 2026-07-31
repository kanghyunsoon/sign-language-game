import type { MatchConnectionOptions } from "../../../match";

export type BattleConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR";

export interface BattleConnectionOptions extends MatchConnectionOptions { readonly hostPlayerId?: string; readonly playerIds?: readonly string[]; }

export type BattleLetterState = "FALLING" | "SETTLED" | "REMOVING" | "REMOVED";

export interface BattleBodyTransform {
  readonly id: string;
  readonly symbol: string;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly angularVelocity: number;
  readonly state: BattleLetterState;
}

interface ClientEnvelope { readonly commandId: string; readonly matchId: string; }

export type ClientBattleMessage =
  | (ClientEnvelope & { readonly type: "CLAIM_SHARED_TARGET"; readonly targetId: string; readonly symbol: string; readonly occurredAt: number })
  | (ClientEnvelope & { readonly type: "REMOVE_LETTER_COMMAND"; readonly letterId: string; readonly symbol: string; readonly occurredAt: number })
  | (ClientEnvelope & { readonly type: "PLAYER_GAME_OVER_COMMAND"; readonly occurredAt: number })
  | (ClientEnvelope & { readonly type: "PLAYER_FORFEIT_COMMAND"; readonly occurredAt: number })
  | (ClientEnvelope & { readonly type: "PLAYER_RECONNECTED"; readonly occurredAt: number })
  | (ClientEnvelope & { readonly type: "REQUEST_MATCH_STATE"; readonly occurredAt: number })
  | (ClientEnvelope & { readonly type: "PEER_BOARD_VIEW"; readonly observerPlayerId: string; readonly subjectPlayerId: string; readonly sentAt: number; readonly bodies: readonly BattleBodyTransform[] })
  | (ClientEnvelope & { readonly type: "RESULT_RECORDED_COMMAND"; readonly recordedAt: number })
  | { readonly type: "BODY_TRANSFORM_BATCH"; readonly matchId: string; readonly playerId: string; readonly sequence: number; readonly sentAt: number; readonly bodies: readonly BattleBodyTransform[] }
  | { readonly type: "BOARD_SNAPSHOT"; readonly matchId: string; readonly playerId: string; readonly sequence: number; readonly sentAt: number; readonly bodies: readonly BattleBodyTransform[] };

interface ServerEnvelope { readonly type: string; readonly sequence: number; }

export interface MatchStartedEvent extends ServerEnvelope { readonly type: "START_MATCH" | "MATCH_STARTED" | "GAME_START"; readonly matchId: string; readonly roomId: string; readonly playerIds: readonly string[]; readonly startAt: number; readonly matchVersion?: string; readonly ruleVersion?: string; readonly serverTime?: number; /** True only when a reconnecting client must restore an already-running match. */ readonly resume?: boolean; readonly playerStates?: readonly { readonly playerId: string; readonly score: number; readonly combo: number; readonly maxCombo: number; readonly removedCount: number; readonly gameOver: boolean }[]; /** Included atomically on resume so a reconnect cannot miss the current paper glyph. */ readonly sharedTarget?: { readonly targetId: string; readonly symbol: string; readonly presentedAt: number }; }
export interface SpawnLetterEvent extends ServerEnvelope { readonly type: "SPAWN_LETTER"; readonly matchId: string; readonly playerId: string; readonly letterId: string; readonly spawnIndex: number; readonly symbol: string; readonly spawnAt: number; readonly normalizedX: number; readonly initialAngle: number; readonly targetPriority?: boolean; }
export interface SharedTargetEvent extends ServerEnvelope { readonly type: "SHARED_TARGET"; readonly matchId: string; readonly targetId: string; readonly symbol: string; readonly presentedAt: number; }
export interface SharedTargetClaimedEvent extends ServerEnvelope { readonly type: "SHARED_TARGET_CLAIMED"; readonly matchId: string; readonly targetId: string; readonly winnerPlayerId: string; readonly symbol: string; readonly score: number; readonly combo: number; readonly maxCombo: number; readonly removedCount: number; readonly acceptedAt: number; }
export interface RemoveAcceptedEvent extends ServerEnvelope { readonly type: "REMOVE_LETTER_ACCEPTED"; readonly commandId?: string; readonly playerId: string; readonly letterId: string; readonly symbol: string; readonly score: number; readonly combo: number; readonly maxCombo: number; readonly removedCount: number; readonly acceptedAt: number; }
export interface RemoveRejectedEvent extends ServerEnvelope { readonly type: "REMOVE_LETTER_REJECTED"; readonly commandId?: string; readonly letterId?: string; readonly code: string; readonly message: string; readonly rejectedAt: number; }
export interface ScoreUpdatedEvent extends ServerEnvelope { readonly type: "SCORE_UPDATED"; readonly playerId: string; readonly score: number; }
export interface ComboUpdatedEvent extends ServerEnvelope { readonly type: "COMBO_UPDATED"; readonly playerId: string; readonly combo: number; readonly maxCombo: number; }
export interface AttackCreatedEvent extends ServerEnvelope { readonly type: "ATTACK_CREATED" | "ATTACK_APPLIED"; readonly attackId: string; readonly attackerPlayerId: string; readonly targetPlayerId: string; readonly attackType: string; readonly amount: number; readonly sourceCombo: number; readonly createdAt: number; }
export interface OtterTransferEvent extends ServerEnvelope { readonly type: "OTTER_TRANSFER"; readonly matchId: string; readonly sourcePlayerId: string; readonly targetPlayerId: string; readonly sourceLetterId: string; readonly sourceNormalizedX: number; readonly symbol: string; readonly direction: "left-to-right" | "right-to-left"; readonly pickupAt: number; readonly throwAt: number; }
export interface MatchFinishedEvent extends ServerEnvelope { readonly type: "MATCH_FINISHED"; readonly matchId: string; readonly winnerPlayerId: string | null; readonly loserPlayerId: string | null; readonly reason: string; readonly finishedAt: number; readonly results?: readonly { readonly playerId: string; readonly score: number; readonly maxCombo: number; readonly removedCount: number; readonly attackCount?: number }[]; }
export interface ResultRecordedEvent extends ServerEnvelope { readonly type: "RESULT_RECORDED"; readonly matchId: string; readonly recordedAt: number; }
export interface PlayerConnectionEvent extends ServerEnvelope { readonly type: "PLAYER_DISCONNECTED" | "PLAYER_RECONNECTED"; readonly playerId: string; }
export interface TransformBatchEvent extends ServerEnvelope { readonly type: "BODY_TRANSFORM_BATCH"; readonly matchId: string; readonly playerId: string; readonly sentAt: number; readonly bodies: readonly BattleBodyTransform[]; }
export interface BoardSnapshotEvent extends ServerEnvelope { readonly type: "BOARD_SNAPSHOT"; readonly matchId: string; readonly playerId: string; readonly sentAt: number; readonly bodies: readonly BattleBodyTransform[]; }
export interface LetterSpawnedSyncEvent extends ServerEnvelope { readonly type: "LETTER_SPAWNED_SYNC"; readonly matchId: string; readonly playerId: string; readonly body: BattleBodyTransform; }
export interface LetterStateSyncEvent extends ServerEnvelope { readonly type: "LETTER_STATE_SYNC"; readonly matchId: string; readonly playerId: string; readonly letterId: string; readonly state: BattleLetterState; }
export interface LetterRemovedSyncEvent extends ServerEnvelope { readonly type: "LETTER_REMOVED_SYNC"; readonly matchId: string; readonly playerId: string; readonly letterId: string; }

export type ServerBattleMessage = MatchStartedEvent | SpawnLetterEvent | SharedTargetEvent | SharedTargetClaimedEvent | RemoveAcceptedEvent | RemoveRejectedEvent
  | ScoreUpdatedEvent | ComboUpdatedEvent | AttackCreatedEvent | OtterTransferEvent | MatchFinishedEvent | PlayerConnectionEvent
  | TransformBatchEvent | BoardSnapshotEvent | LetterSpawnedSyncEvent | LetterStateSyncEvent | LetterRemovedSyncEvent | ResultRecordedEvent;
