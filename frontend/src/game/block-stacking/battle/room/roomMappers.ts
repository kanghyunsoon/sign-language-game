import type { GameModuleUser } from "../../../app/GameModule";
import type {
  BattleRoomDetail,
  BattleRoomParticipant,
  BattleRoomSession,
  BattleRoomStatus,
  BattleRoomSummary,
  CreateRoomRequest,
  RoomApiErrorBody,
} from "./roomTypes";
import { isSymbolRange } from "./symbolRange";

const ROOM_STATUSES = new Set<BattleRoomStatus>(["WAITING", "FULL", "COUNTDOWN", "PLAYING", "FINISHED"]);

export function mapRoomListResponse(payload: unknown, currentUser: GameModuleUser): readonly BattleRoomSummary[] {
  const records = Array.isArray(payload) ? payload : readArray(payload, "rooms") ?? readArray(payload, "items");
  if (!records) throw new Error("방 목록 응답 형식이 올바르지 않습니다.");
  return records.map((record) => mapRoomDetail(record, currentUser));
}

export function mapRoomDetail(payload: unknown, currentUser: GameModuleUser): BattleRoomDetail {
  const record = asRecord(payload, "방 정보");
  const roomId = readString(record, "roomId");
  const title = readOptionalString(record, "title") ?? readString(record, "roomTitle");
  const hostUserId = readString(record, "hostUserId");
  const maxPlayers = readNumber(record, "maxPlayers");
  const status = readStatus(record.status);
  const participants = mapParticipants(record, currentUser, hostUserId);
  const isCurrentUserParticipant = participants.some((participant) => participant.userId === currentUser.userId);
  const playerCount = readOptionalNumber(record, "playerCount") ?? participants.length;
  const readyForGame = readOptionalBoolean(record, "readyForGame") ?? playerCount === maxPlayers;
  const serverCanStart = readOptionalBoolean(record, "canStart");
  const canStart = serverCanStart ?? (readyForGame && status === "FULL" && currentUser.userId === hostUserId);
  const serverReason = readOptionalString(record, "startBlockReason");

  return {
    roomId,
    title,
    status,
    playerCount,
    maxPlayers,
    hostUserId,
    hostName: participants.find((participant) => participant.userId === hostUserId)?.displayName ?? shortParticipantName(hostUserId),
    symbolRange: readSymbolRange(record.symbolRange),
    createdAt: readTimestamp(record.createdAt),
    // A player who was already in a running room must be able to return to it
    // after a transient browser/WebRTC disconnect, even though new players may not join.
    canJoin: (status === "WAITING" && playerCount < maxPlayers)
      || (isCurrentUserParticipant && (status === "PLAYING" || status === "FINISHED")),
    gameType: (readOptionalString(record, "gameType") ?? "BLOCK_BATTLE") as BattleRoomSummary["gameType"],
    visibility: (readOptionalString(record, "visibility") ?? "PUBLIC") as BattleRoomSummary["visibility"],
    roomCode: readNullableString(record, "roomCode"),
    matchDurationMs: readOptionalNumber(record, "matchDurationMs") ?? 60_000,
    participants,
    canStart,
    startBlockReason: canStart ? undefined : serverReason ?? defaultStartBlockReason(status, playerCount, maxPlayers),
    rematch: readOptionalBoolean(record, "rematch") ?? false,
    activeMatchId: readNullableString(record, "activeMatchId"),
    matchStartAt: readTimestamp(record.matchStartAt),
  };
}

export function mapRoomSession(payload: unknown, currentUser: GameModuleUser): BattleRoomSession {
  return { ...mapRoomDetail(payload, currentUser), currentUser };
}

export function mapDevCreateRoomRequest(request: CreateRoomRequest): object {
  return { roomTitle: request.roomTitle.trim(), maxPlayers: 2, symbolRange: request.symbolRange, rematch: false };
}

export function mapBackendCreateRoomRequest(request: CreateRoomRequest): object {
  return { roomTitle: request.roomTitle.trim(), symbolRange: request.symbolRange };
}

function readSymbolRange(value: unknown): import("./symbolRange").SymbolRange | readonly string[] {
  if (isSymbolRange(value)) return value;
  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string")) return value;
  throw new Error("Invalid symbolRange.");
}

export function mapRoomApiError(payload: unknown, fallback: string): Error {
  if (isRecord(payload)) {
    const body: RoomApiErrorBody = {
      code: typeof payload.code === "string" ? payload.code : undefined,
      message: typeof payload.message === "string" ? payload.message : undefined,
    };
    if (body.message) return new Error(body.message);
  }
  return new Error(fallback);
}

function mapParticipants(record: Record<string, unknown>, currentUser: GameModuleUser, hostUserId: string): readonly BattleRoomParticipant[] {
  if (Array.isArray(record.participants)) {
    return record.participants.map((value) => {
      const participant = asRecord(value, "참가자");
      const userId = readOptionalString(participant, "userId") ?? readString(participant, "participantId");
      return {
        userId,
        displayName: readOptionalString(participant, "displayName") ?? displayNameFor(userId, currentUser),
        isHost: readOptionalBoolean(participant, "isHost") ?? userId === hostUserId,
        isBot: readOptionalBoolean(participant, "bot") ?? readOptionalBoolean(participant, "isBot") ?? false,
      };
    });
  }
  return readStringArray(record, "playerIds").map((userId) => ({
    userId,
    displayName: displayNameFor(userId, currentUser),
    isHost: userId === hostUserId,
    isBot: false,
  }));
}

function displayNameFor(userId: string, currentUser: GameModuleUser): string {
  return userId === currentUser.userId ? currentUser.displayName : shortParticipantName(userId);
}

function shortParticipantName(userId: string): string {
  return `참가자 ${userId.slice(0, 6)}`;
}

function defaultStartBlockReason(status: BattleRoomStatus, count: number, max: number): string {
  if (count < max) return "상대방이 입장해야 시작할 수 있습니다.";
  if (status !== "FULL") return "현재 방 상태에서는 시작할 수 없습니다.";
  return "서버의 시작 허가를 기다리고 있습니다.";
}

function readStatus(value: unknown): BattleRoomStatus {
  if (typeof value !== "string" || !ROOM_STATUSES.has(value as BattleRoomStatus)) throw new Error("알 수 없는 방 상태입니다.");
  return value as BattleRoomStatus;
}

function readTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function readStringArray(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${key} 형식이 올바르지 않습니다.`);
  return value as string[];
}

function readArray(payload: unknown, key: string): unknown[] | null {
  return isRecord(payload) && Array.isArray(payload[key]) ? payload[key] : null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = readOptionalString(record, key);
  if (!value) throw new Error(`${key} 값이 없습니다.`);
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === "string" && record[key].trim() ? record[key].trim() : undefined;
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  return record[key] === null || record[key] === undefined ? null : readString(record, key);
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = readOptionalNumber(record, key);
  if (value === undefined) throw new Error(`${key} 값이 없습니다.`);
  return value;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  return typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] : undefined;
}

function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  return typeof record[key] === "boolean" ? record[key] : undefined;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} 응답 형식이 올바르지 않습니다.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
