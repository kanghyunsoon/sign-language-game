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
 * Swagger-backed solo result client.
 *
 * The backend deliberately has no solo room/session endpoint. Session lifetime
 * remains local and only the elapsed-second score is reported on completion.
 */
export class HttpSoloGameApi implements SoloGameApi {
  private readonly baseUrl: string;
  private readonly fetcher: SoloFetch;
  private readonly credentials: RequestCredentials;
  private readonly configuredHeaders: HeadersInit | SoloHeadersProvider;
  private readonly now: () => number;
  private readonly createId: () => string;
  private activeSession: StartSoloSessionResponse | null = null;
  private latestResult: SoloGameResult | null = null;

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
    this.activeSession = session;
    return session;
  }

  async completeSession(soloSessionId: string, request: CompleteSoloSessionRequest): Promise<SoloGameResult> {
    const session = this.activeSession;
    if (session === null || session.soloSessionId !== soloSessionId) {
      throw new SoloGameApiError("Solo session was not found.");
    }

    const payload = await this.request(
      `/solo-results?userId=${encodeURIComponent(this.options.userId)}`,
      {
        method: "POST",
        body: JSON.stringify({ score: request.finalScore }),
      },
    );
    const recordedScore = parseReportedScore(payload);
    const result: SoloGameResult = {
      ...request,
      finalScore: recordedScore,
      symbolStatistics: [...request.symbolStatistics],
      soloSessionId,
      userId: session.userId,
      playMode: session.playMode,
      difficulty: session.difficulty,
      startedAt: session.startedAt,
    };
    this.latestResult = result;
    this.activeSession = null;
    return result;
  }

  async getResults(): Promise<readonly SoloGameResult[]> {
    return this.latestResult === null ? [] : [this.latestResult];
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

function parseReportedScore(value: unknown): number {
  const record = requireRecord(value, "solo result");
  return requireInteger(record.score, "score");
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

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `solo-${Date.now()}`;
}
