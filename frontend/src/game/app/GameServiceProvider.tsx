import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import { HttpSoloGameApi } from "../block-stacking/solo/api";
import { BackendBattleRoomGateway, DevBattleRoomGateway } from "../block-stacking/battle/room";
import type { BattleRoomSession } from "../block-stacking/battle/room";
import type {
  GameModuleServices,
} from "../contracts/GameModuleServices";
import { Stomp } from "@stomp/stompjs";
import { StompBattleTransport, type StompClientLike } from "../block-stacking/battle/transport/StompBattleTransport";
import { GameModuleContext } from "./GameModuleContext";
import type { GameModuleConfig, GameModuleUser } from "./GameModule";
import { DefaultSharedGameCameraSession } from "../media/camera/SharedGameCameraSession";
import { MeshBattleMediaSession } from "../media/mesh/MeshBattleMediaSession";
import { requestWebRtcClientConfig } from "../media/mesh/webRtcConfig";
import { WebSocketWebRtcSignalingTransport, type SignalingStompClient } from "../media/signaling/WebSocketWebRtcSignalingTransport";
import { createDevAuthHeaders } from "./devAuthHeaders";
import { BackendDevLineRaceBotGateway, BackendLineRaceRoomGateway, DevLineRaceRoomGateway } from "../glyph-battle/room";
import type { LineRaceRoomSession } from "../glyph-battle/room";
import { StompLineRaceTransport } from "../glyph-battle/transport";
import { DefaultActivePlayerSession } from "../recognition/active-player";
import { StompGlyphTurnMatchTransport } from "../glyph-battle/duel/GlyphTurnMatchTransport";
import { RecognitionVisionProvider } from "../recognition/vision";

interface GameServiceProviderProps extends PropsWithChildren {
  readonly user: GameModuleUser;
  readonly accessToken?: string;
  readonly config: GameModuleConfig;
  readonly onExit?: () => void;
  readonly serviceOverrides?: Partial<GameModuleServices>;
}

export function GameServiceProvider({ children, user, accessToken, config, onExit, serviceOverrides }: GameServiceProviderProps) {
  const cleanupGenerationRef = useRef(0);
  const [sharedCameraSession] = useState(() => new DefaultSharedGameCameraSession());
  const [activePlayerSession] = useState(() => new DefaultActivePlayerSession());
  const [battleMediaSession] = useState(() => {
    const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : createDevAuthHeaders(user);
    return new MeshBattleMediaSession({
      localUser: user,
      loadIceServers: async () => (await requestWebRtcClientConfig(config.rtcConfigApiBaseUrl ?? "/api/rtc/config", { headers })).iceServers,
      createSignalingTransport: () => new WebSocketWebRtcSignalingTransport({
        url: config.gameWebSocketUrl,
        localUserId: user.userId,
        headers,
        createClient: (url) => Stomp.client(url) as SignalingStompClient,
      }),
    });
  });
  const lineRaceMediaSession = battleMediaSession;
  const [battleRoomSession, setBattleRoomSession] = useState<BattleRoomSession | null>(null);
  const [lineRaceRoomSession, setLineRaceRoomSession] = useState<LineRaceRoomSession | null>(null);
  const services = useMemo(
    () => ({ ...createDefaultServices(user, accessToken, config), ...serviceOverrides }),
    [accessToken, config, serviceOverrides, user],
  );
  // The active transport must come from the service boundary as well. Otherwise
  // a replacement Match module can override block battle but not glyph battle.
  const [lineRaceTransport] = useState(() => services.lineRaceTransportFactory?.create("")
    ?? new StompLineRaceTransport((url)=>Stomp.client(url) as StompClientLike, { channels: config.matchChannels }));
  const [glyphTurnTransport] = useState(() => services.glyphTurnMatchTransportFactory?.create("")
    ?? new StompGlyphTurnMatchTransport((url)=>Stomp.client(url) as StompClientLike,{channels:config.matchChannels}));
  const value = useMemo(
    () => ({ user, accessToken, config, services, battleMediaSession, lineRaceMediaSession, lineRaceTransport, glyphTurnTransport, sharedCameraSession, activePlayerSession, battleRoomSession, setBattleRoomSession, lineRaceRoomSession, setLineRaceRoomSession, onExit }),
    [accessToken, activePlayerSession, battleMediaSession, battleRoomSession, config, glyphTurnTransport, lineRaceMediaSession, lineRaceRoomSession, lineRaceTransport, onExit, services, sharedCameraSession, user],
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
        lineRaceTransport.disconnect();
        glyphTurnTransport.disconnect();
        void battleMediaSession.disconnect().finally(() => sharedCameraSession.stop());
      });
    };
  }, [activePlayerSession, battleMediaSession, glyphTurnTransport, lineRaceTransport, sharedCameraSession]);

  return (
    <RecognitionVisionProvider factory={services.recognitionVisionAdapterFactory}>
      <GameModuleContext.Provider value={value}>{children}</GameModuleContext.Provider>
    </RecognitionVisionProvider>
  );
}

function createDefaultServices(user: GameModuleUser, accessToken: string | undefined, config: GameModuleConfig): GameModuleServices {
  const headers: HeadersInit = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : createDevAuthHeaders(user);
  return {
    soloGameApi: new HttpSoloGameApi({ baseUrl: config.soloApiBaseUrl, credentials: "include", headers }),
    battleRoomGateway: accessToken
      ? new BackendBattleRoomGateway({ baseUrl: config.roomApiBaseUrl, currentUser: user, credentials: "include", headers })
      : new DevBattleRoomGateway({ baseUrl: config.roomApiBaseUrl, currentUser: user, credentials: "include", headers }),
    battleGameTransportFactory: {
      create: () => new StompBattleTransport((url) => Stomp.client(url) as StompClientLike, { channels: config.matchChannels }),
    },
    lineRaceRoomGateway: accessToken
      ? new BackendLineRaceRoomGateway({baseUrl:config.roomApiBaseUrl,currentUser:user,credentials:"include",headers})
      : new DevLineRaceRoomGateway({baseUrl:config.roomApiBaseUrl,currentUser:user,credentials:"include",headers}),
    lineRaceTransportFactory:{create:()=>new StompLineRaceTransport((url)=>Stomp.client(url) as StompClientLike,{channels:config.matchChannels})},
    glyphTurnMatchTransportFactory:{create:()=>new StompGlyphTurnMatchTransport((url)=>Stomp.client(url) as StompClientLike,{channels:config.matchChannels})},
    lineRaceBotGateway: new BackendDevLineRaceBotGateway({baseUrl:config.roomApiBaseUrl,currentUser:user,credentials:"include",headers}),
  };
}
