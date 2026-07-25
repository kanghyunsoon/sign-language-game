import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import { HttpSoloGameApi } from "../block-stacking/solo/api";
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
  const [battleRoomSession, setBattleRoomSession] = useState<BattleRoomSession | null>(null);
  const [turnBattleRoomSession, setTurnBattleRoomSession] = useState<BattleRoomSession | null>(null);
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

function createDefaultServices(user: GameModuleUser, accessToken: string | undefined, config: GameModuleConfig, getGameDataChannel: () => import("../media/core/GameDataChannel").GameDataChannel | null): GameModuleServices {
  const headers: HeadersInit = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : createDevAuthHeaders(user);
  const useSwaggerContract = Boolean(accessToken) || import.meta.env.VITE_P2P_E2E === "true";
  return {
    soloGameApi: new HttpSoloGameApi({ baseUrl: config.soloApiBaseUrl, credentials: "include", headers }),
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
