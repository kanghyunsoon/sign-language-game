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

export function GameModule(props: GameModuleProps) {
  return (
    <GameServiceProvider {...props}>
      <section className={styles.module} data-game-module="true">
        <GameModuleRoutes />
      </section>
    </GameServiceProvider>
  );
}
