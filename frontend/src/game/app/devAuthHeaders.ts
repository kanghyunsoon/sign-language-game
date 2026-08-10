import type { GameModuleUser } from "./GameModule";

/** HTTP header values are ASCII-safe while the Dev App restores the UTF-8 name. */
export function createDevAuthHeaders(user: GameModuleUser): Readonly<Record<string, string>> {
  return {
    "X-Dev-User-Id": user.userId,
    "X-Dev-User-Name": encodeURIComponent(user.displayName),
  };
}
