import type { ExternalUuid } from "./soloContracts";

export type GameRoomStatus = "WAITING" | "FULL" | "COUNTDOWN" | "PLAYING" | "FINISHED";

export interface CreateDevRoomRequest {
  readonly roomTitle: string;
  readonly maxPlayers: number;
  readonly difficulty: string;
  readonly symbolRange: readonly string[];
  readonly rematch: boolean;
}

export interface GameRoomSnapshot {
  readonly roomId: ExternalUuid;
  readonly roomTitle: string;
  readonly hostUserId: ExternalUuid;
  readonly playerIds: readonly ExternalUuid[];
  readonly maxPlayers: number;
  readonly readyForGame: boolean;
  readonly status: GameRoomStatus;
  readonly difficulty: string;
  readonly symbolRange: readonly string[];
  readonly rematch: boolean;
  readonly activeMatchId: ExternalUuid | null;
  readonly matchStartAt: number | null;
}
