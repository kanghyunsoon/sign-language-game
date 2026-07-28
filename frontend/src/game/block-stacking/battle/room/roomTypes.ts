import type { GameModuleUser } from "../../../app/GameModule";

export type BattleRoomStatus = "WAITING" | "FULL" | "COUNTDOWN" | "PLAYING" | "FINISHED";
export type GameType = "BLOCK_BATTLE" | "LINE_RACE";
export type RoomVisibility = "PUBLIC" | "PRIVATE";

export interface BattleRoomParticipant {
  readonly userId: string;
  readonly displayName: string;
  readonly isHost: boolean;
  readonly isBot?: boolean;
  readonly ready?: boolean;
}

export interface BattleRoomSummary {
  readonly roomId: string;
  readonly title: string;
  readonly status: BattleRoomStatus;
  readonly playerCount: number;
  readonly maxPlayers: number;
  readonly hostUserId: string;
  readonly hostName: string;
  readonly difficulty: string;
  readonly symbolRange: readonly string[];
  readonly createdAt: number | null;
  readonly canJoin: boolean;
  readonly gameType?: GameType;
  readonly visibility?: RoomVisibility;
  readonly roomCode?: string | null;
  readonly matchDurationMs?: number;
}

export interface BattleRoomDetail extends BattleRoomSummary {
  readonly participants: readonly BattleRoomParticipant[];
  readonly canStart: boolean;
  readonly startBlockReason?: string;
  readonly hostReady?: boolean;
  readonly guestReady?: boolean;
  readonly currentUserReady?: boolean;
  readonly rematch: boolean;
  readonly activeMatchId: string | null;
  readonly matchStartAt: number | null;
  /** Provided by create/join and consumed for the first room WebSocket handshake. */
  readonly realtimeTicket?: string;
}

export interface BattleRoomSession extends BattleRoomDetail {
  readonly currentUser: GameModuleUser;
}

export interface CreateRoomRequest {
  readonly title: string;
  readonly difficulty: string;
  readonly symbolRange: readonly string[];
}

export interface BattleRoomGatewayOptions {
  readonly baseUrl: string;
  readonly currentUser: GameModuleUser;
  readonly headers?: HeadersInit;
  readonly credentials?: RequestCredentials;
  readonly fetch?: typeof globalThis.fetch;
}

export interface RoomApiErrorBody {
  readonly code?: string;
  readonly message?: string;
}
