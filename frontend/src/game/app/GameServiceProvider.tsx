import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import { HttpSoloGameApi, LocalSoloGameApi } from "../block-stacking/solo/api";
import { DevBattleRoomGateway, SwaggerBattleRoomGateway } from "../block-stacking/battle/room";
import type { BattleRoomSession } from "../block-stacking/battle/room";
import type {
  GameModuleServices,
} from "../contracts/GameModuleServices";
import { P2pBattleTransport } from "../block-stacking/battle/transport/P2pBattleTransport";
import { GameModuleContext } from "./GameModuleContext";
import type { GameModuleConfig, GameModuleUser } from "./GameModule";
import { DefaultSharedGameCameraSession } from "../media/camera/SharedGameCameraSession";
import { MeshBattleMediaSession } from "../media/mesh/MeshBattleMediaSession";
import { requestWebRtcClientConfig } from "../media/mesh/webRtcConfig";
import { createDevAuthHeaders } from "./devAuthHeaders";
import { DefaultActivePlayerSession } from "../recognition/active-player";
import { P2pGlyphTurnMatchTransport } from "../glyph-battle/duel/P2pGlyphTurnMatchTransport";
import { RecognitionVisionProvider } from "../recognition/vision";
import { NativeRoomWebRtcSignalingTransport, RealtimeTicketClient, RoomRealtimeSocket } from "../realtime";

interface GameServiceProviderProps extends PropsWithChildren {
  readonly user: GameModuleUser;
  readonly accessToken?: string;
  readonly config: GameModuleConfig;
  readonly onExit?: () => void;
  readonly serviceOverrides?: Partial<GameModuleServices>;
}

export function GameServiceProvider({ children, user, accessToken, config, onExit, serviceOverrides }: GameServiceProviderProps) {
  const cleanupGenerationRef = useRef(0);
  const [sharedCameraSession] = useState(() => new DefaultSharedGameCameraSession(
    import.meta.env.VITE_P2P_E2E === "true" ? { getUserMedia: async () => createE2eCameraStream() } : {},
  ));
  const [activePlayerSession] = useState(() => new DefaultActivePlayerSession());
  const [battleMediaSession] = useState(() => {
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : createDevAuthHeaders(user);
    return new MeshBattleMediaSession({
      localUser: user,
      loadIceServers: async () => (await requestWebRtcClientConfig(config.rtcConfigApiBaseUrl ?? "/api/webrtc/ice-servers", { headers })).iceServers,
      createSignalingTransport: (roomId) => {
        const ticketClient = new RealtimeTicketClient({
          apiBaseUrl: config.roomApiBaseUrl,
          userId: user.userId,
          headers,
        });
        const roomSocket = new RoomRealtimeSocket({
          webSocketBaseUrl: config.roomWebSocketBaseUrl ?? config.gameWebSocketUrl,
          roomId,
          localUserId: user.userId,
          ticketClient,
        });
        return new NativeRoomWebRtcSignalingTransport(roomSocket);
      },
    });
  });
  const [battleRoomSession, setBattleRoomSessionState] = useState<BattleRoomSession | null>(() => readBattleRoomSession(user.userId));
  const setBattleRoomSession = useCallback((session: BattleRoomSession | null) => {
    setBattleRoomSessionState(session);
    persistBattleRoomSession(user.userId, session);
  }, [user.userId]);
  const [turnBattleRoomSession, setTurnBattleRoomSession] = useState<BattleRoomSession | null>(null);
  useEffect(() => {
    // Auth hydration can replace the initial user object after this provider
    // has mounted. Re-read the room bookmark for that authenticated identity
    // instead of leaving a refreshed /play route with an empty session.
    setBattleRoomSessionState((current) => current && String(current.currentUser.userId) === String(user.userId) ? current : readBattleRoomSession(user.userId));
  }, [user.userId]);
  const services = useMemo(
    () => ({ ...createDefaultServices(user, accessToken, config, () => battleMediaSession.getGameDataChannel()), ...serviceOverrides }),
    [accessToken, config, serviceOverrides, user],
  );
  const [glyphTurnTransport] = useState(() => new P2pGlyphTurnMatchTransport({
    getChannel: () => battleMediaSession.getGameDataChannel(),
    localPlayerId: user.userId,
  }));
  const value = useMemo(
    () => ({ user, accessToken, config, services, battleMediaSession, glyphTurnTransport, sharedCameraSession, activePlayerSession, battleRoomSession, setBattleRoomSession, turnBattleRoomSession, setTurnBattleRoomSession, onExit }),
    [accessToken, activePlayerSession, battleMediaSession, battleRoomSession, config, glyphTurnTransport, turnBattleRoomSession, onExit, services, sharedCameraSession, user],
  );

  useEffect(() => {
    // 개발 중 Fast Refresh가 state 객체는 보존하고 effect만 다시 시작할 수 있다.
    activePlayerSession.reactivate();
    cleanupGenerationRef.current += 1;
    return () => {
      // React StrictMode performs an immediate setup -> cleanup -> setup probe in development.
      // A microtask avoids adding a game timer; the second setup invalidates this generation.
      const cleanupGeneration = ++cleanupGenerationRef.current;
      queueMicrotask(() => {
        if (cleanupGenerationRef.current !== cleanupGeneration) return;
        activePlayerSession.dispose();
        glyphTurnTransport.disconnect();
        void battleMediaSession.disconnect().finally(() => sharedCameraSession.stop());
      });
    };
  }, [activePlayerSession, battleMediaSession, glyphTurnTransport, sharedCameraSession]);

  return (
    <RecognitionVisionProvider factory={services.recognitionVisionAdapterFactory}>
      <GameModuleContext.Provider value={value}>{children}</GameModuleContext.Provider>
    </RecognitionVisionProvider>
  );
}

const BATTLE_ROOM_SESSION_KEY_PREFIX = "sudal:block-battle:room:";

function readBattleRoomSession(userId: string): BattleRoomSession | null {
  try {
    if (typeof window === "undefined") return null;
    const key = BATTLE_ROOM_SESSION_KEY_PREFIX + userId;
    const raw = window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
    if (!raw) return null;
    const session = JSON.parse(raw) as BattleRoomSession;
    // Earlier builds persisted a numeric user id. Keep its room recovery
    // entry when it still belongs to this authenticated browser user.
    return session?.roomId && String(session.currentUser?.userId) === String(userId) ? session : null;
  } catch {
    return null;
  }
}

function persistBattleRoomSession(userId: string, session: BattleRoomSession | null): void {
  try {
    if (typeof window === "undefined") return;
    const key = BATTLE_ROOM_SESSION_KEY_PREFIX + userId;
    if (session) {
      const serialized = JSON.stringify(session);
      window.sessionStorage.setItem(key, serialized);
      window.localStorage.setItem(key, serialized);
    } else {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }
  } catch {
    // Browser privacy settings can disable session storage; gameplay still works.
  }
}

function createDefaultServices(user: GameModuleUser, accessToken: string | undefined, config: GameModuleConfig, getGameDataChannel: () => import("../media/core/GameDataChannel").GameDataChannel | null): GameModuleServices {
  // 운영 빌드에서는 dev 폴백(DevBattleRoomGateway + X-Dev-User 헤더)을 차단한다.
  // /game 진입은 ProtectedRoute가 accessToken을 보장하므로 여기서는 방어적 처리다.
  const isProduction = import.meta.env.PROD;
  const headers: HeadersInit = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : isProduction
      ? {}
      : createDevAuthHeaders(user);
  const useSwaggerContract =
    Boolean(accessToken) || import.meta.env.VITE_P2P_E2E === "true" || isProduction;
  return {
    // Swagger exposes roomless solo result reporting. The play session itself
    // stays client-side; production reports the elapsed-second score directly.
    soloGameApi: useSwaggerContract
      ? new HttpSoloGameApi({ baseUrl: config.soloApiBaseUrl, userId: user.userId, credentials: "include", headers })
      : new LocalSoloGameApi({ userId: user.userId }),
    battleRoomGateway: useSwaggerContract
      ? new SwaggerBattleRoomGateway({ baseUrl: config.roomApiBaseUrl, currentUser: user, credentials: "include", headers, gameType: "TETRIS_DUEL" })
      : new DevBattleRoomGateway({ baseUrl: config.roomApiBaseUrl, currentUser: user, credentials: "include", headers }),
    turnBattleRoomGateway: useSwaggerContract
      ? new SwaggerBattleRoomGateway({ baseUrl: config.roomApiBaseUrl, currentUser: user, credentials: "include", headers, gameType: "SIGN_DUEL" })
      : new DevBattleRoomGateway({ baseUrl: config.roomApiBaseUrl, currentUser: user, credentials: "include", headers }),
    roomRealtimeSocketFactory: {
      create: (roomId) => {
        const ticketClient = new RealtimeTicketClient({
          apiBaseUrl: config.roomApiBaseUrl,
          userId: user.userId,
          headers,
        });
        return new RoomRealtimeSocket({
          webSocketBaseUrl: config.roomWebSocketBaseUrl ?? config.gameWebSocketUrl,
          roomId,
          localUserId: user.userId,
          ticketClient,
        });
      },
    },
    battleGameTransportFactory: {
      create: () => new P2pBattleTransport(getGameDataChannel, user.userId),
    },
  };
}

function createE2eCameraStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("E2E camera canvas is unavailable.");
  context.fillStyle = "#153229";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f2f7df";
  context.font = "32px sans-serif";
  context.fillText("P2P E2E synthetic camera", 90, 190);
  return canvas.captureStream(5);
}
