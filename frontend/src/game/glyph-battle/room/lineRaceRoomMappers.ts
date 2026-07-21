import { mapRoomDetail, mapRoomListResponse, mapRoomSession } from "../../block-stacking/battle/room/roomMappers";
import type { GameModuleUser } from "../../app/GameModule";
import type { CreateLineRaceRoomOptions, LineRaceRoomDetail, LineRaceRoomSession, LineRaceRoomSummary } from "./lineRaceRoomTypes";
import { isCompetitiveRecognitionReady } from "../../recognition/readiness/recognitionReadiness";

export function mapLineRaceRoomList(payload: unknown, user: GameModuleUser): readonly LineRaceRoomSummary[] {
  return mapRoomListResponse(payload, user).filter((room) => room.gameType === "LINE_RACE").map((room) => room as LineRaceRoomSummary);
}
export function mapLineRaceRoom(payload: unknown, user: GameModuleUser): LineRaceRoomDetail {
  const room = mapRoomDetail(payload, user); if (room.gameType !== "LINE_RACE") throw new Error("라인 레이스 방이 아닙니다."); return room as LineRaceRoomDetail;
}
export function mapLineRaceSession(payload: unknown, user: GameModuleUser): LineRaceRoomSession {
  const room = mapRoomSession(payload, user); if (room.gameType !== "LINE_RACE") throw new Error("라인 레이스 방이 아닙니다."); return room as LineRaceRoomSession;
}
export function mapLineRaceCreateRequest(request: CreateLineRaceRoomOptions): object {
  const supportedSymbols = request.supportedSymbols.filter(isCompetitiveRecognitionReady);
  if (supportedSymbols.length < 2 || supportedSymbols.length !== request.supportedSymbols.length) throw new Error("경쟁 인식 readiness를 통과한 지문자만 사용할 수 있습니다.");
  return { roomTitle: request.title.trim(), title: request.title.trim(), maxPlayers: 2, difficulty: "NORMAL",
    symbolRange: [...supportedSymbols], rematch: false, gameType: "LINE_RACE", visibility: request.visibility,
    matchDurationMs: request.matchDurationMs, gameConfig: { matchDurationMs: request.matchDurationMs, supportedSymbols: [...supportedSymbols] } };
}
