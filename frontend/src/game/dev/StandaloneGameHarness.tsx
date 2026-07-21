import { MemoryRouter, Route, Routes } from "react-router-dom";

import { GameModule, type GameModuleConfig } from "../app/GameModule";
import { STANDALONE_GAME_CONFIG } from "../config/standaloneConfig";

export interface StandaloneGameHarnessProps {
  readonly initialPath?: string;
  readonly config?: GameModuleConfig;
}

export function StandaloneGameHarness({ initialPath = standaloneInitialPath(), config = STANDALONE_GAME_CONFIG }: StandaloneGameHarnessProps) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/game/*"
          element={(
            <GameModule
              user={standaloneUser()}
              config={config}
            />
          )}
        />
      </Routes>
    </MemoryRouter>
  );
}

function standaloneUser() {
  if (!import.meta.env.DEV || typeof window === "undefined")
    return { userId: "00000000-0000-4000-8000-000000000001", displayName: "개발 사용자" };
  const persona = new URLSearchParams(window.location.search).get("devUser");
  if (persona === "host2")
    return { userId: "00000000-0000-4000-8000-000000000003", displayName: "개발 방장 2" };
  if (persona === "guest2")
    return { userId: "00000000-0000-4000-8000-000000000004", displayName: "개발 참가자 2" };
  if (persona === "host3")
    return { userId: "00000000-0000-4000-8000-000000000005", displayName: "개발 방장 3" };
  if (persona === "guest3")
    return { userId: "00000000-0000-4000-8000-000000000006", displayName: "개발 참가자 3" };
  if (persona === "host4")
    return { userId: "00000000-0000-4000-8000-000000000007", displayName: "개발 방장 4" };
  if (persona === "guest4")
    return { userId: "00000000-0000-4000-8000-000000000008", displayName: "개발 참가자 4" };
  if (persona === "host5")
    return { userId: "00000000-0000-4000-8000-000000000009", displayName: "개발 방장 5" };
  if (persona === "guest5")
    return { userId: "00000000-0000-4000-8000-000000000010", displayName: "개발 참가자 5" };
  if (persona === "guest")
    return { userId: "00000000-0000-4000-8000-000000000002", displayName: "개발 참가자" };
  if (persona === "host")
    return { userId: "00000000-0000-4000-8000-000000000001", displayName: "개발 방장" };
  return { userId: "00000000-0000-4000-8000-000000000001", displayName: "개발 사용자" };
}

function standaloneInitialPath(): string {
  if (typeof window === "undefined") return "/game";
  const requested = new URLSearchParams(window.location.search).get("gamePath");
  return requested?.startsWith("/game/") ? requested : "/game";
}
