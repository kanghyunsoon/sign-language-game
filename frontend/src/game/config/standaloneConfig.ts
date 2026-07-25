import type { GameModuleConfig } from "../app/GameModule";

const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
const host = typeof window !== "undefined" ? window.location.host : "localhost:5173";

export const STANDALONE_GAME_CONFIG: GameModuleConfig = {
  soloApiBaseUrl: "/api",
  roomApiBaseUrl: import.meta.env.VITE_GAME_ROOM_API_BASE_URL?.trim() || "/api",
  gameWebSocketUrl: import.meta.env.VITE_GAME_WEBSOCKET_URL?.trim() || `${protocol}//${host}/api/ws/game-rooms`,
  roomWebSocketBaseUrl: import.meta.env.VITE_GAME_WEBSOCKET_URL?.trim() || `${protocol}//${host}/api/ws/game-rooms`,
  rtcConfigApiBaseUrl: "/api/webrtc/ice-servers",
  aiWebSocketUrl: import.meta.env.VITE_AI_WEBSOCKET_URL?.trim() || "ws://localhost:8765",
};
