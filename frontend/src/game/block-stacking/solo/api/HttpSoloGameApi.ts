import type {
  CompleteSoloSessionRequest,
  SoloGameApi,
  SoloGameResult,
  StartSoloSessionRequest,
  StartSoloSessionResponse,
} from "./SoloGameApi";

export type SoloFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type SoloHeadersProvider = () => HeadersInit | Promise<HeadersInit>;

export interface HttpSoloGameApiOptions {
  readonly baseUrl?: string;
  readonly userId: string;
  readonly fetcher?: SoloFetch;
  readonly credentials?: RequestCredentials;
  readonly headers?: HeadersInit | SoloHeadersProvider;
  readonly now?: () => number;
  readonly createId?: () => string;
}

export class SoloGameApiError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "SoloGameApiError";
  }
}

/**
 * OpenAPI-backed solo result and ranking client.
 *
 * The backend no longer exposes a solo-session resource. The richer session
 * model remains local so gameplay can keep its existing lifecycle, while game
 * completion is translated to the documented POST /solo-results contract.
 */
export class HttpSoloGameApi implements SoloGameApi {
  private readonly baseUrl: string;
  private readonly fetcher: SoloFetch;
  private readonly credentials: RequestCredentials;
  private readonly configuredHeaders: HeadersInit | SoloHeadersProvider;
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly sessions = new Map<string, StartSoloSessionResponse>();
  private readonly completedResults: SoloGameResult[] = [];

  constructor(private readonly options: HttpSoloGameApiOptions) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.credentials = options.credentials ?? "same-origin";
    this.configuredHeaders = options.headers ?? {};
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? createSessionId;
  }

  async startSession(request: StartSoloSessionRequest): Promise<StartSoloSessionResponse> {
    const session: StartSoloSessionResponse = {
      ...request,
      symbolRange: [...request.symbolRange],
      soloSessionId: this.createId(),
      userId: this.options.userId,
      startedAt: this.now(),
    };
    this.sessions.set(session.soloSessionId, session);
    return session;
  }

  async completeSession(soloSessionId: string, request: CompleteSoloSessionRequest): Promise<SoloGameResult> {
    const session = this.sessions.get(soloSessionId);
    if (!session) throw new SoloGameApiError("Local solo session was not found.");
    const response = parseSoloResultResponse(await this.request(
      `/solo-results?userId=${encodeURIComponent(this.options.userId)}`,
      {
        method: "POST",
        body: JSON.stringify({ score: toElapsedScoreSeconds(request.playDurationMs) }),
      },
    ));
    const result: SoloGameResult = {
      ...request,
      finalScore: response.score,
      symbolStatistics: [...request.symbolStatistics],
      soloSessionId,
      userId: session.userId,
      playMode: session.playMode,
      difficulty: session.difficulty,
      startedAt: session.startedAt,
      // The current SoloResultResponse contains resultId and score only.
      awardedExp: 0,
    };
    this.sessions.delete(soloSessionId);
    this.completedResults.push(result);
    return result;
  }

  async getResults(): Promise<readonly SoloGameResult[]> {
    return [...this.completedResults];
  }

  async getRank(): Promise<number | null> {
    const payload = await this.request(
      `/rankings?userId=${encodeURIComponent(this.options.userId)}&gameType=TETRIS_SOLO`,
      { method: "GET" },
    );
    return parseMyRank(payload);
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const configured = typeof this.configuredHeaders === "function"
      ? await this.configuredHeaders()
      : this.configuredHeaders;
    const headers = new Headers(configured);
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        ...init,
        credentials: this.credentials,
        headers,
      });
    } catch (cause) {
      const detail = cause instanceof Error && cause.message ? ` (${cause.message})` : "";
      throw new SoloGameApiError(`Solo game API is unavailable at ${this.baseUrl}.${detail}`);
    }
    if (!response.ok) throw new SoloGameApiError(`Solo game API returned ${response.status}.`, response.status);
    return response.json() as Promise<unknown>;
  }
}

function parseSoloResultResponse(value: unknown): { readonly resultId: number; readonly score: number } {
  const record = requireRecord(value, "solo result");
  return {
    resultId: requireInteger(record.resultId, "resultId"),
    score: requirePositiveInteger(record.score, "score"),
  };
}

function parseMyRank(value: unknown): number | null {
  const response = requireRecord(value, "ranking response");
  if (response.me === null || response.me === undefined) return null;
  const me = requireRecord(response.me, "ranking entry");
  return requireInteger(me.rank, "rank");
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SoloGameApiError(`${name} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SoloGameApiError(`${name} must be a non-negative integer.`);
  }
  return value;
}

function requirePositiveInteger(value: unknown, name: string): number {
  const integer = requireInteger(value, name);
  if (integer < 1) {
    throw new SoloGameApiError(`${name} must be a positive integer.`);
  }
  return integer;
}

function toElapsedScoreSeconds(playDurationMs: number): number {
  return Math.max(1, Math.ceil(playDurationMs / 1_000));
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `solo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
