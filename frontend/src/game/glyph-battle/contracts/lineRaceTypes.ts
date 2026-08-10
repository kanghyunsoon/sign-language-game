export type LineRaceMatchStatus =
  | "WAITING"
  | "COUNTDOWN"
  | "PLAYING"
  | "FINISHED"
  | "CANCELLED";

export type LineRaceRunnerState = "RUNNING" | "TRAVERSING" | "FINISHED" | "DISCONNECTED";

export type LineRaceObstacleStatus =
  | "WARNING"
  | "FALLING"
  | "ACTIVE"
  | "COUNTERED"
  | "TRAVERSING"
  | "TRAVERSED"
  | "EXPIRED";

export type LineRaceRoomVisibility = "PUBLIC" | "PRIVATE";
export type LineRaceRoomStatus = "WAITING" | "FULL" | "COUNTDOWN" | "PLAYING" | "FINISHED";

export interface CreateLineRaceRoomRequest {
  readonly roomTitle: string;
  readonly visibility: LineRaceRoomVisibility;
}

export interface LineRaceRoomParticipant {
  readonly playerId: string;
  readonly displayName: string;
  readonly ready: boolean;
}

export interface LineRaceRoomSnapshot {
  readonly roomId: string;
  readonly roomTitle: string;
  readonly gameType: "LINE_RACE";
  readonly visibility: LineRaceRoomVisibility;
  readonly hostUserId: string;
  readonly participants: readonly LineRaceRoomParticipant[];
  readonly maxPlayers: 2;
  readonly status: LineRaceRoomStatus;
  readonly activeMatchId: string | null;
  readonly createdAt: number;
}

export interface StartLineRaceMatchRequest {
  readonly commandId: string;
}

export interface LineRaceMatchStartAccepted {
  readonly matchId: string;
  readonly roomId: string;
  readonly status: "COUNTDOWN";
  readonly acceptedAt: number;
}

export interface LineRaceMatchConfig {
  readonly raceLength: number;
  readonly baseSpeedPerSecond: number;
  readonly matchDurationMs: number;
  readonly countdownMs: number;
  readonly handSize: number;
  readonly attackCooldownMs: number;
  readonly counterWindowMs: number;
  readonly obstacleLeadDistance: number;
  readonly minimumObstacleSpacing: number;
  readonly maxPendingObstacles: number;
  readonly reconnectGraceMs: number;
  readonly supportedSymbols: readonly string[];
}

export interface LineRacePlayerState {
  readonly playerId: string;
  readonly progress: number;
  readonly score: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly attackHand: readonly string[];
  readonly pendingObstacleIds: readonly string[];
  readonly currentTraversalObstacleId?: string;
  readonly accumulatedPenaltyMs: number;
  readonly finishedAt?: number;
  readonly connected: boolean;
  readonly state: LineRaceRunnerState;
}

/** Snapshot-safe player state. Opponents' attack hands are never serialized. */
export type LineRacePublicPlayerState = Omit<LineRacePlayerState, "attackHand">;

export interface LineRaceObstacle {
  readonly obstacleId: string;
  readonly templateId: string;
  readonly symbol: string;
  readonly attackerPlayerId: string;
  readonly targetPlayerId: string;
  readonly coursePosition: number;
  readonly penaltyMs: number;
  readonly createdAt: number;
  readonly warningEndsAt: number;
  readonly counterDeadlineAt: number;
  readonly traversalStartedAt?: number;
  readonly traversalFinishedAt?: number;
  readonly status: LineRaceObstacleStatus;
}

export interface LineRaceSymbolStatistic {
  readonly symbol: string;
  readonly recognitionAttempts: number;
  readonly recognitionSuccesses: number;
  readonly attackSuccesses: number;
  readonly counterAttempts: number;
  readonly counterSuccesses: number;
  readonly averageRecognitionMs: number;
}

export interface LineRacePlayerResult {
  readonly playerId: string;
  readonly finalProgress: number;
  readonly attacksAttempted: number;
  readonly attacksAccepted: number;
  readonly countersAttempted: number;
  readonly countersSucceeded: number;
  readonly obstaclesTraversed: number;
  readonly accumulatedPenaltyMs: number;
  readonly maxCombo: number;
  readonly averageRecognitionMs: number;
  readonly symbolStatistics: readonly LineRaceSymbolStatistic[];
}

export interface LineRaceMatchResult {
  readonly matchId: string;
  readonly roomId: string;
  readonly winnerPlayerId?: string;
  readonly loserPlayerId?: string;
  readonly finishReason: "FINISH_LINE" | "TIME_LIMIT" | "DISCONNECT_TIMEOUT" | "FORFEIT" | "DRAW";
  readonly results: readonly LineRacePlayerResult[];
  readonly startedAt: number;
  readonly finishedAt: number;
}
