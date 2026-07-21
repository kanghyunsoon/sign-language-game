import type { EpochMillis, ExternalUuid } from "./soloContracts";

export type LetterSyncState = "FALLING" | "SETTLED" | "REMOVING" | "REMOVED";
export type BattleOutcome = "WIN" | "LOSE" | "DRAW";
export type GameOverReason = "DANGER_LINE" | "DISCONNECTED";

export interface StartBattleMatchCommand {
  readonly type: "START_MATCH";
  readonly commandId: ExternalUuid;
  readonly roomId: ExternalUuid;
  /** Informational only. The server authorizes with the authenticated principal. */
  readonly requestedByUserId: ExternalUuid;
  readonly difficulty: string;
  readonly symbolRange: readonly string[];
  readonly rematch: boolean;
}

export interface BattleMatchStarted {
  readonly type: "START_MATCH";
  readonly eventId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly roomId: ExternalUuid;
  readonly playerIds: readonly [ExternalUuid, ExternalUuid];
  readonly startAt: EpochMillis;
  readonly matchVersion: string;
  readonly sequence: number;
}

export interface SpawnLetterEvent {
  readonly type: "SPAWN_LETTER";
  readonly eventId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly playerId: ExternalUuid;
  readonly letterId: ExternalUuid;
  readonly spawnIndex: number;
  readonly symbol: string;
  readonly spawnAt: EpochMillis;
  readonly normalizedX: number;
  readonly initialAngle: number;
  readonly sequence: number;
}

export interface RemoveLetterCommand {
  readonly type: "REMOVE_LETTER_COMMAND";
  readonly commandId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly letterId: ExternalUuid;
  readonly symbol: string;
  readonly occurredAt: EpochMillis;
}

export interface RemoveLetterAcceptedEvent {
  readonly type: "REMOVE_LETTER_ACCEPTED";
  readonly eventId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly playerId: ExternalUuid;
  readonly letterId: ExternalUuid;
  readonly symbol: string;
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly removedCount: number;
  readonly acceptedAt: EpochMillis;
  readonly sequence: number;
}

export interface RemoveLetterRejectedEvent {
  readonly type: "REMOVE_LETTER_REJECTED";
  readonly eventId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly playerId: ExternalUuid;
  readonly letterId: ExternalUuid;
  readonly symbol: string;
  readonly code: string;
  readonly message: string;
  readonly rejectedAt: EpochMillis;
  readonly sequence: number;
}

export interface ScoreUpdatedEvent {
  readonly type: "SCORE_UPDATED";
  readonly eventId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly playerId: ExternalUuid;
  readonly score: number;
  readonly removedCount: number;
  readonly updatedAt: EpochMillis;
  readonly sequence: number;
}

export interface ComboUpdatedEvent {
  readonly type: "COMBO_UPDATED";
  readonly eventId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly playerId: ExternalUuid;
  readonly combo: number;
  readonly maxCombo: number;
  readonly updatedAt: EpochMillis;
  readonly sequence: number;
}

export interface AttackCreatedEvent {
  readonly type: "ATTACK_CREATED";
  readonly eventId: ExternalUuid;
  readonly attackId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly attackerPlayerId: ExternalUuid;
  readonly targetPlayerId: ExternalUuid;
  readonly attackType: string;
  readonly amount: number;
  readonly sourceCombo: number;
  readonly createdAt: EpochMillis;
  readonly sequence: number;
}

export interface AttackAppliedEvent {
  readonly type: "ATTACK_APPLIED";
  readonly eventId: ExternalUuid;
  readonly attackId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly targetPlayerId: ExternalUuid;
  readonly attackType: string;
  readonly amount: number;
  readonly appliedAt: EpochMillis;
  readonly sequence: number;
}

export interface PlayerGameOverCommand {
  readonly type: "PLAYER_GAME_OVER_COMMAND";
  readonly commandId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly reason: GameOverReason;
  readonly occurredAt: EpochMillis;
}

export interface PlayerReconnectedCommand {
  readonly type: "PLAYER_RECONNECTED";
  readonly commandId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly occurredAt: EpochMillis;
}

export interface RequestMatchStateCommand {
  readonly type: "REQUEST_MATCH_STATE";
  readonly commandId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly occurredAt: EpochMillis;
}

export interface PlayerDisconnectedEvent {
  readonly type: "PLAYER_DISCONNECTED";
  readonly eventId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly playerId: ExternalUuid;
  readonly disconnectedAt: EpochMillis;
  readonly reconnectDeadlineAt: EpochMillis;
  readonly sequence: number;
}

export interface PlayerReconnectedEvent {
  readonly type: "PLAYER_RECONNECTED";
  readonly eventId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly playerId: ExternalUuid;
  readonly reconnectedAt: EpochMillis;
  readonly sequence: number;
}

export interface BattlePlayerResult {
  readonly playerId: ExternalUuid;
  readonly score: number;
  readonly maxCombo: number;
  readonly removedCount: number;
  readonly outcome: BattleOutcome;
}

export interface MatchFinishedEvent {
  readonly type: "MATCH_FINISHED";
  readonly eventId: ExternalUuid;
  readonly matchId: ExternalUuid;
  readonly roomId: ExternalUuid;
  readonly winnerPlayerId: ExternalUuid;
  readonly loserPlayerId: ExternalUuid;
  readonly reason: string;
  readonly results: readonly BattlePlayerResult[];
  readonly startedAt: EpochMillis;
  readonly finishedAt: EpochMillis;
  readonly sequence: number;
}

export interface BodyTransform {
  readonly id: ExternalUuid;
  readonly symbol: string;
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly angularVelocity: number;
  readonly state: LetterSyncState;
}

interface DisplaySyncBase {
  readonly matchId: ExternalUuid;
  /** Display routing hint only; never authoritative identity. */
  readonly playerId: ExternalUuid;
  readonly sequence: number;
  readonly sentAt: EpochMillis;
}

export interface LetterSpawnedSync extends DisplaySyncBase {
  readonly type: "LETTER_SPAWNED_SYNC";
  readonly body: BodyTransform;
}

export interface BodyTransformBatch extends DisplaySyncBase {
  readonly type: "BODY_TRANSFORM_BATCH";
  readonly bodies: readonly BodyTransform[];
}

export interface LetterStateSync extends DisplaySyncBase {
  readonly type: "LETTER_STATE_SYNC";
  readonly letterId: ExternalUuid;
  readonly state: LetterSyncState;
}

export interface LetterRemovedSync extends DisplaySyncBase {
  readonly type: "LETTER_REMOVED_SYNC";
  readonly letterId: ExternalUuid;
}

export interface BoardSnapshot extends DisplaySyncBase {
  readonly type: "BOARD_SNAPSHOT";
  readonly bodies: readonly BodyTransform[];
}

export interface PlayerDisplayState extends DisplaySyncBase {
  readonly type: "PLAYER_DISPLAY_STATE";
  readonly dangerRatio: number;
  readonly activeLetterCount: number;
  readonly displayStatus: "PLAYING" | "DISCONNECTED" | "GAME_OVER";
}

export type BattleCommand = StartBattleMatchCommand | RemoveLetterCommand | PlayerGameOverCommand | PlayerReconnectedCommand | RequestMatchStateCommand;

export type BattleAuthoritativeEvent =
  | BattleMatchStarted
  | SpawnLetterEvent
  | RemoveLetterAcceptedEvent
  | RemoveLetterRejectedEvent
  | ScoreUpdatedEvent
  | ComboUpdatedEvent
  | AttackCreatedEvent
  | AttackAppliedEvent
  | PlayerDisconnectedEvent
  | PlayerReconnectedEvent
  | MatchFinishedEvent;

/** Display-only messages must never be used to calculate official score or winner. */
export type BattleDisplaySyncMessage =
  | LetterSpawnedSync
  | BodyTransformBatch
  | LetterStateSync
  | LetterRemovedSync
  | BoardSnapshot
  | PlayerDisplayState;

export type BattleWebSocketPayload = BattleCommand | BattleAuthoritativeEvent | BattleDisplaySyncMessage;
