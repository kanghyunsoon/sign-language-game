import type { LineRaceAttackRejectionReason, LineRaceCounterFailureReason } from "./lineRaceErrors";
import type { LineRaceMatchSnapshot } from "./lineRaceSnapshot";
import type { LineRaceMatchConfig, LineRaceObstacle, LineRacePlayerResult } from "./lineRaceTypes";

interface LineRaceEventEnvelope {
  readonly type: string;
  readonly eventId: string;
  readonly matchId: string;
  readonly sequence: number;
  readonly occurredAt: number;
}

export interface LineRaceMatchPlayer {
  readonly playerId: string;
  readonly displayName: string;
}

export interface LineRaceMatchStartedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_MATCH_STARTED";
  readonly roomId: string;
  readonly config: LineRaceMatchConfig;
  readonly players: readonly LineRaceMatchPlayer[];
  readonly startAt: number;
  readonly finishDeadlineAt: number;
}

/** Private event. Initial deal, attack refill, and reconnect resync use the same shape. */
export interface LineRaceHandDealtEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_HAND_DEALT";
  readonly playerId: string;
  readonly hand: readonly string[];
}

/** Broadcast event. The replacement hand is deliberately excluded. */
export interface LineRaceAttackAcceptedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_ATTACK_ACCEPTED";
  readonly attackerPlayerId: string;
  readonly targetPlayerId: string;
  readonly consumedSymbol: string;
  readonly obstacle: LineRaceObstacle;
  readonly combo: number;
}

/** Private response to the command sender. */
export interface LineRaceAttackRejectedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_ATTACK_REJECTED";
  readonly commandId: string;
  readonly reason: LineRaceAttackRejectionReason;
}

export interface LineRaceCounterSucceededEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_COUNTER_SUCCEEDED";
  readonly playerId: string;
  readonly obstacleId: string;
  readonly symbol: string;
  readonly counterAt: number;
}

/** Private response to the command sender. */
export interface LineRaceCounterFailedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_COUNTER_FAILED";
  readonly commandId: string;
  readonly playerId: string;
  readonly obstacleId: string;
  readonly reason: LineRaceCounterFailureReason;
}

export interface LineRaceObstacleCreatedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_OBSTACLE_CREATED";
  readonly obstacleId: string;
  readonly obstacle: LineRaceObstacle;
}

export interface LineRaceObstacleFallingEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_OBSTACLE_FALLING";
  readonly obstacleId: string;
  readonly fallingStartedAt: number;
}

export interface LineRaceObstacleActivatedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_OBSTACLE_ACTIVATED";
  readonly obstacleId: string;
  readonly activatedAt: number;
  readonly counterDeadlineAt: number;
}

export interface LineRaceTraversalStartedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_TRAVERSAL_STARTED";
  readonly obstacleId: string;
  readonly playerId: string;
  readonly templateId: string;
  readonly traversalStartedAt: number;
  readonly traversalFinishAt: number;
}

export interface LineRaceTraversalFinishedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_TRAVERSAL_FINISHED";
  readonly obstacleId: string;
  readonly playerId: string;
  readonly traversalFinishedAt: number;
  readonly accumulatedPenaltyMs: number;
}

export type LineRaceObstacleRemovalReason = "COUNTERED" | "TRAVERSED" | "EXPIRED" | "MATCH_FINISHED";

export interface LineRaceObstacleRemovedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_OBSTACLE_REMOVED";
  readonly obstacleId: string;
  readonly reason: LineRaceObstacleRemovalReason;
}

export interface LineRaceProgressUpdatedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_PROGRESS_UPDATED";
  readonly serverTime: number;
  readonly players: readonly {
    readonly playerId: string;
    readonly progress: number;
    readonly accumulatedPenaltyMs: number;
    readonly currentObstacleId?: string;
    readonly state: "RUNNING" | "TRAVERSING" | "FINISHED";
  }[];
}

export type LineRaceFinishReason =
  | "FINISH_LINE"
  | "TIME_LIMIT"
  | "DISCONNECT_TIMEOUT"
  | "FORFEIT"
  | "DRAW";

export interface LineRaceMatchFinishedEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_MATCH_FINISHED";
  readonly roomId: string;
  readonly winnerPlayerId?: string;
  readonly loserPlayerId?: string;
  readonly finishReason: LineRaceFinishReason;
  readonly results: readonly LineRacePlayerResult[];
  readonly startedAt: number;
  readonly finishedAt: number;
}

/** Private response used after reconnect or an explicit state request. */
export interface LineRaceMatchSnapshotEvent extends LineRaceEventEnvelope {
  readonly type: "LINE_RACE_MATCH_SNAPSHOT";
  readonly snapshot: LineRaceMatchSnapshot;
}

export type LineRaceServerEvent =
  | LineRaceMatchStartedEvent
  | LineRaceHandDealtEvent
  | LineRaceAttackAcceptedEvent
  | LineRaceAttackRejectedEvent
  | LineRaceCounterSucceededEvent
  | LineRaceCounterFailedEvent
  | LineRaceObstacleCreatedEvent
  | LineRaceObstacleFallingEvent
  | LineRaceObstacleActivatedEvent
  | LineRaceTraversalStartedEvent
  | LineRaceTraversalFinishedEvent
  | LineRaceObstacleRemovedEvent
  | LineRaceProgressUpdatedEvent
  | LineRaceMatchFinishedEvent
  | LineRaceMatchSnapshotEvent;
