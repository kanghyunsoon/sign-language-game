import { useCallback, useLayoutEffect, useState, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import type { GameModuleServices } from "../contracts/GameModuleServices";
import { GameModuleRoutes } from "./GameModuleRoutes";
import { GameServiceProvider } from "./GameServiceProvider";
import styles from "../shared/GameModule.module.css";

export interface GameModuleUser {
  readonly userId: string;
  readonly displayName: string;
}

export interface GameModuleConfig {
  readonly soloApiBaseUrl: string;
  readonly roomApiBaseUrl: string;
  readonly gameWebSocketUrl: string;
  /** Native backend endpoint ending in /ws/game-rooms. */
  readonly roomWebSocketBaseUrl?: string;
  readonly rtcConfigApiBaseUrl?: string;
  readonly aiWebSocketUrl: string;
  readonly battleRoomPollingIntervalMs?: number;
}

export interface GameModuleProps {
  readonly user: GameModuleUser;
  readonly accessToken?: string;
  readonly config: GameModuleConfig;
  readonly onExit?: () => void;
  readonly serviceOverrides?: Partial<GameModuleServices>;
}

const GAME_VIEWPORT_WIDTH = 1920;
const GAME_VIEWPORT_HEIGHT = 1080;
const MODE_VIEWPORT_WIDTH = 1280;
const MODE_VIEWPORT_HEIGHT = 720;

export function GameModule(props: GameModuleProps) {
  const location = useLocation();
  const usesOwnSoloCanvas = location.pathname === "/game/solo";
  const isRecognitionTool = location.pathname.startsWith("/game/recognition/");
  // The category screen was designed at the same 1280×720 proportion as the
  // block-mode selector. Keeping it in the compact fixed canvas prevents the
  // 1280×720 page from sitting inside a larger 1920×1080 canvas at browser
  // zoom levels.
  const usesModeSelectionCanvas = location.pathname === "/game" || location.pathname === "/game/block";
  const usesRoomFinderCanvas =
    location.pathname === "/game/battle" || location.pathname.startsWith("/game/battle/") ||
    location.pathname === "/game/turn-battle" || location.pathname.startsWith("/game/turn-battle/");
  const useFixedGameCanvas = !usesOwnSoloCanvas && !isRecognitionTool;
  const usesCompactCanvas = usesModeSelectionCanvas || usesRoomFinderCanvas;
  const viewportWidth = usesCompactCanvas ? MODE_VIEWPORT_WIDTH : GAME_VIEWPORT_WIDTH;
  const viewportHeight = usesCompactCanvas ? MODE_VIEWPORT_HEIGHT : GAME_VIEWPORT_HEIGHT;
  const getViewportScale = useCallback(
    () => Math.min(window.innerWidth / viewportWidth, window.innerHeight / viewportHeight),
    [viewportHeight, viewportWidth],
  );
  const [viewportScale, setViewportScale] = useState(getViewportScale);

  useLayoutEffect(() => {
    if (!useFixedGameCanvas) return undefined;
    const updateScale = () => setViewportScale(getViewportScale());
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [getViewportScale, useFixedGameCanvas]);

  return (
    <GameServiceProvider {...props}>
      <section
        className={[styles.module, useFixedGameCanvas ? styles.fixedViewportModule : undefined].filter(Boolean).join(" ")}
        data-game-module="true"
        data-fixed-game-canvas={useFixedGameCanvas ? "true" : undefined}
      >
        {useFixedGameCanvas ? (
          <div
            className={styles.gameViewportCanvas}
            style={{
              "--game-viewport-scale": viewportScale,
              "--game-viewport-width": `${viewportWidth}px`,
              "--game-viewport-height": `${viewportHeight}px`,
            } as CSSProperties}
          >
            <GameModuleRoutes />
          </div>
        ) : (
          <GameModuleRoutes />
        )}
      </section>
    </GameServiceProvider>
  );
}
