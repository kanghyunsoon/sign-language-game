import type {
  CompleteSoloSessionRequest,
  SoloGameApi,
  SoloGameResult,
  StartSoloSessionRequest,
  StartSoloSessionResponse,
} from "./SoloGameApi";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface LocalSoloGameApiOptions {
  readonly userId: string;
  readonly storage?: StorageLike | null;
  readonly now?: () => number;
  readonly createId?: () => string;
  readonly storageKey?: string;
}

/**
 * Browser-local solo score store. The current production backend has no
 * published solo-session contract, so solo play must not be blocked by it.
 */
export class LocalSoloGameApi implements SoloGameApi {
  private readonly sessions = new Map<string, StartSoloSessionResponse>();
  private readonly userId: string;
  private readonly storage: StorageLike | null;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly storageKey: string;

  constructor(options: LocalSoloGameApiOptions) {
    this.userId = options.userId;
    this.storage = options.storage ?? getBrowserStorage();
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? createSessionId;
    this.storageKey = options.storageKey ?? `sudal-play.solo-results.${options.userId}.v1`;
  }

  async startSession(request: StartSoloSessionRequest): Promise<StartSoloSessionResponse> {
    const session: StartSoloSessionResponse = {
      ...request,
      symbolRange: [...request.symbolRange],
      soloSessionId: this.createId(),
      userId: this.userId,
      startedAt: this.now(),
    };
    this.sessions.set(session.soloSessionId, session);
    return session;
  }

  async completeSession(soloSessionId: string, request: CompleteSoloSessionRequest): Promise<SoloGameResult> {
    const session = this.sessions.get(soloSessionId);
    if (!session) throw new Error("Local solo session was not found.");
    const results = this.readResults();
    if (results.some((result) => result.soloSessionId === soloSessionId)) throw new Error("Local solo session is already completed.");
    const result: SoloGameResult = {
      ...request,
      symbolStatistics: [...request.symbolStatistics],
      soloSessionId,
      userId: session.userId,
      playMode: session.playMode,
      difficulty: session.difficulty,
      startedAt: session.startedAt,
      awardedExp: 0,
    };
    this.writeResults([...results, result]);
    this.sessions.delete(soloSessionId);
    return result;
  }

  async getResults(): Promise<readonly SoloGameResult[]> {
    return this.readResults();
  }

  async getRank(): Promise<number | null> {
    const results = this.readResults();
    if (results.length === 0) return null;
    const latest = results[results.length - 1];
    const rank = [...results]
      .sort((left, right) => left.finalScore - right.finalScore || left.endedAt - right.endedAt)
      .findIndex((result) => result.soloSessionId === latest.soloSessionId);
    return rank < 0 ? null : rank + 1;
  }

  private readResults(): SoloGameResult[] {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed as SoloGameResult[] : [];
    } catch {
      return [];
    }
  }

  private writeResults(results: readonly SoloGameResult[]): void {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(results));
    } catch {
      // Gameplay and result display remain available if browser storage is disabled.
    }
  }
}

function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `solo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
