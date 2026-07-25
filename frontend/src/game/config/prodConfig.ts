import type { GameModuleConfig } from "../app/GameModule";

/**
 * 배포 백엔드(Swagger 계약)용 게임 모듈 설정.
 *
 * 중요 — roomApiBaseUrl 은 반드시 "/api" 이다(기본값).
 *   SwaggerBattleRoomGateway -> BackendGameRoomClient 가 base 뒤에 "/game-rooms" 를
 *   직접 붙이고(RealtimeTicketClient 는 "/auth/sse-ticket" 을 붙인다), 따라서
 *   최종 호출은 "/api/game-rooms", "/api/auth/sse-ticket" 가 된다.
 *   여기에 "/api/game-rooms" 를 넣으면 "/api/game-rooms/game-rooms" 로 중복되어 404가 난다.
 *
 * 프론트가 백엔드와 같은 오리진(nginx)로 서빙되므로 WebSocket/REST 는 상대 경로/현재 host
 * 기준으로 배포값이 그대로 도출된다.
 */

const wsProtocol =
  typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
const host = typeof window !== "undefined" ? window.location.host : "localhost:5173";

export const PROD_GAME_CONFIG: GameModuleConfig = {
  soloApiBaseUrl: import.meta.env.VITE_API_BASE_URL?.trim() || "/api",
  roomApiBaseUrl: import.meta.env.VITE_GAME_ROOM_API_BASE_URL?.trim() || "/api",
  gameWebSocketUrl:
    import.meta.env.VITE_GAME_WEBSOCKET_URL?.trim() || `${wsProtocol}//${host}/api/ws/game-rooms`,
  roomWebSocketBaseUrl:
    import.meta.env.VITE_GAME_WEBSOCKET_URL?.trim() || `${wsProtocol}//${host}/api/ws/game-rooms`,
  rtcConfigApiBaseUrl: "/api/webrtc/ice-servers",
  // 배포 AI 인식 WebSocket 값은 확정 계약에 없어 env 로 주입한다(미설정 시 현재 host 기준 상대값).
  aiWebSocketUrl: import.meta.env.VITE_AI_WEBSOCKET_URL?.trim() || `${wsProtocol}//${host}/ai/ws`,
};
