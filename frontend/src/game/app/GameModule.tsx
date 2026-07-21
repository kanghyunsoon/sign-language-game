import { useEffect } from "react";
import type { GameModuleServices } from "../contracts/GameModuleServices";
import { GameModuleRoutes } from "./GameModuleRoutes";
import { GameServiceProvider } from "./GameServiceProvider";
import styles from "../shared/GameModule.module.css";
import type { MatchChannelConfig } from "../match";

export interface GameModuleUser {
  readonly userId: string;
  readonly displayName: string;
}

export interface GameModuleConfig {
  readonly soloApiBaseUrl: string;
  readonly roomApiBaseUrl: string;
  readonly gameWebSocketUrl: string;
  readonly rtcConfigApiBaseUrl?: string;
  readonly aiWebSocketUrl: string;
  readonly battleRoomPollingIntervalMs?: number;
  /** Backend-shell routes. Match implementations remain game-specific. */
  readonly matchChannels?: Partial<MatchChannelConfig>;
}

export interface GameModuleProps {
  readonly user: GameModuleUser;
  readonly accessToken?: string;
  readonly config: GameModuleConfig;
  readonly onExit?: () => void;
  readonly serviceOverrides?: Partial<GameModuleServices>;
}

export function GameModule(props: GameModuleProps) {
  useEffect(() => {
    const preventWheelZoom = (event: WheelEvent) => { if (event.ctrlKey) event.preventDefault(); };
    const preventKeyboardZoom = (event: KeyboardEvent) => {
      if (event.ctrlKey && ["+", "-", "=", "0"].includes(event.key)) event.preventDefault();
    };
    window.addEventListener("wheel", preventWheelZoom, { passive: false });
    window.addEventListener("keydown", preventKeyboardZoom);
    return () => {
      window.removeEventListener("wheel", preventWheelZoom);
      window.removeEventListener("keydown", preventKeyboardZoom);
    };
  }, []);
  return (
    <GameServiceProvider {...props}>
      <section className={styles.module} data-game-module="true">
        <GameModuleRoutes />
      </section>
    </GameServiceProvider>
  );
}
