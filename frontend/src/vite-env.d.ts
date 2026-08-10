/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_P2P_E2E?: "true" | "false";
  /** ?紐꾩쵄/?醫? API 甕곗쥙???login夷똲ignup夷똵sers/me). 疫꿸퀡??"/api". */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GAME_API_BASE_URL?: string;
  readonly VITE_GAME_API_CREDENTIALS?: "omit" | "same-origin" | "include";
  /** Enables the legacy remote solo session API only after the backend exposes it. */
  readonly VITE_ENABLE_REMOTE_SOLO_GAME_API?: "true" | "false";
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
