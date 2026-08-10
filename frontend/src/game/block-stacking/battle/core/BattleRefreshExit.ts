const BATTLE_REFRESH_MARKER_KEY = "sudal:battle-refresh-exit";
const BATTLE_REFRESH_MARKER_MAX_AGE_MS = 30_000;

interface BattleRefreshMarker {
  readonly roomId: string;
  readonly markedAt: number;
}

export function markBattlePageUnload(roomId: string, storage: Storage = window.sessionStorage): void {
  try {
    const marker: BattleRefreshMarker = { roomId, markedAt: Date.now() };
    storage.setItem(BATTLE_REFRESH_MARKER_KEY, JSON.stringify(marker));
  } catch {
    // A denied sessionStorage write must not block the browser from unloading.
  }
}

export function consumeBattleRefreshExit(
  roomId: string,
  navigationType = browserNavigationType(),
  now = Date.now(),
  storage: Storage = window.sessionStorage,
): boolean {
  try {
    const raw = storage.getItem(BATTLE_REFRESH_MARKER_KEY);
    storage.removeItem(BATTLE_REFRESH_MARKER_KEY);
    if (navigationType !== "reload" || !raw) return false;
    const marker = JSON.parse(raw) as Partial<BattleRefreshMarker>;
    return marker.roomId === roomId
      && typeof marker.markedAt === "number"
      && now - marker.markedAt >= 0
      && now - marker.markedAt <= BATTLE_REFRESH_MARKER_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function browserNavigationType(): string {
  if (typeof performance === "undefined") return "navigate";
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return navigation?.type ?? "navigate";
}
