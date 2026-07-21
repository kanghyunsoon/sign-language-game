/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_API_BASE_URL?: string;
  readonly VITE_GAME_API_CREDENTIALS?: "omit" | "same-origin" | "include";
  readonly VITE_GAME_ROOM_API_BASE_URL?: string;
  readonly VITE_GAME_WEBSOCKET_URL?: string;
  readonly VITE_MATCH_COMMAND_DESTINATION?: string;
  readonly VITE_MATCH_PLAYER_DESTINATION?: string;
  readonly VITE_MATCH_BROADCAST_DESTINATION?: string;
  readonly VITE_AI_WEBSOCKET_URL?: string;
  readonly VITE_DEV_USER_ID?: string;
  readonly VITE_LINE_RACE_DEV_TOOLS?: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
