import type { GameModuleConfig } from "../app/GameModule";

export const STANDALONE_GAME_CONFIG: GameModuleConfig = {
  soloApiBaseUrl: "/api",
  roomApiBaseUrl: import.meta.env.VITE_GAME_ROOM_API_BASE_URL?.trim() || "/api/dev",
  gameWebSocketUrl: import.meta.env.VITE_GAME_WEBSOCKET_URL?.trim() || "ws://localhost:8091/ws/game",
  rtcConfigApiBaseUrl: "/api/rtc/config",
  aiWebSocketUrl: "ws://localhost:8765",
  matchChannels: {
    commandDestination: import.meta.env.VITE_MATCH_COMMAND_DESTINATION?.trim() || "/app/game/message",
    playerDestinationTemplate: import.meta.env.VITE_MATCH_PLAYER_DESTINATION?.trim() || "/queue/game/player/{playerId}",
    matchDestinationTemplate: import.meta.env.VITE_MATCH_BROADCAST_DESTINATION?.trim() || "/topic/game/match/{matchId}",
  },
};
