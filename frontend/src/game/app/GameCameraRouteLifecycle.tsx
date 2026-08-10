import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useGameModuleContext } from "./GameModuleContext";

/**
 * Keeps the shared camera alive while a camera page owns it and releases every
 * media track as soon as browser history or app navigation leaves those pages.
 */
export function GameCameraRouteLifecycle() {
  const { pathname } = useLocation();
  const { sharedCameraSession } = useGameModuleContext();

  useEffect(() => {
    if (!isGameCameraRoute(pathname)) sharedCameraSession.stop();
  }, [pathname, sharedCameraSession]);

  return null;
}

export function isGameCameraRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "game") return false;
  if (segments.length === 2 && segments[1] === "solo") return true;

  if (segments[1] === "battle") {
    if (segments.length === 3 && segments[2] === "practice") return true;
    if (segments.length === 3 && segments[2] !== "preview") return true;
    return segments.length === 4 && segments[3] === "play";
  }

  if (segments[1] === "turn-battle") {
    if (segments.length === 3 && segments[2] === "practice") return true;
    return segments.length === 4 && segments[3] === "play";
  }

  return false;
}
