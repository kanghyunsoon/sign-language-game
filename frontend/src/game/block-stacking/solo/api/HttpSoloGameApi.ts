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
}

export class SoloGameApiError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "SoloGameApiError";
  }
}

/** OpenAPI-backed solo session, result, and ranking client. */
export class HttpSoloGameApi implements SoloGameApi {
  private readonly baseUrl: string;
  private readonly fetcher: SoloFetch;
  private readonly credentials: RequestCredentials;
  private readonly configuredHeaders: HeadersInit | SoloHeadersProvider;

  constructor(private readonly options: HttpSoloGameApiOptions) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.credentials = options.credentials ?? "same-origin";
    this.configuredHeaders = options.headers ?? {};
  }

  async startSession(request: StartSoloSessionRequest): Promise<StartSoloSessionResponse> {
    return parseStartSoloSession(await this.request(
      `/game/solo/sessions?userId=${encodeURIComponent(this.options.userId)}`,
      { method: "POST", body: JSON.stringify(request) },
    ));
  }

  async completeSession(soloSessionId: string, request: CompleteSoloSessionRequest): Promise<SoloGameResult> {
    return parseSoloGameResult(await this.request(
      `/game/solo/sessions/${encodeURIComponent(soloSessionId)}/complete?userId=${encodeURIComponent(this.options.userId)}`,
      { method: "POST", body: JSON.stringify(request) },
    ));
  }

  async getResults(): Promise<readonly SoloGameResult[]> {
    const payload = await this.request(
      `/game/solo/results?userId=${encodeURIComponent(this.options.userId)}`,
      { method: "GET" },
    );
    if (!Array.isArray(payload)) throw new SoloGameApiError("solo results must be an array.");
    return payload.map(parseSoloGameResult);
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

function parseStartSoloSession(value: unknown): StartSoloSessionResponse {
  const record = requireRecord(value, "solo session");
  return {
    soloSessionId: requireString(record.soloSessionId, "soloSessionId"),
    userId: requireString(record.userId, "userId"),
    difficulty: requireString(record.difficulty, "difficulty"),
    symbolRange: requireStringArray(record.symbolRange, "symbolRange"),
    playMode: requirePlayMode(record.playMode),
    startedAt: requireInteger(record.startedAt, "startedAt"),
  };
}

function parseSoloGameResult(value: unknown): SoloGameResult {
  const record = requireRecord(value, "solo result");
  return {
    soloSessionId: requireString(record.soloSessionId, "soloSessionId"),
    userId: requireString(record.userId, "userId"),
    difficulty: requireString(record.difficulty, "difficulty"),
    playMode: requirePlayMode(record.playMode),
    finalScore: requireInteger(record.finalScore, "finalScore"),
    maxCombo: requireInteger(record.maxCombo, "maxCombo"),
    removedSymbolCount: requireInteger(record.removedSymbolCount, "removedSymbolCount"),
    playDurationMs: requireInteger(record.playDurationMs, "playDurationMs"),
    symbolStatistics: requireSymbolStatistics(record.symbolStatistics),
    startedAt: requireInteger(record.startedAt, "startedAt"),
    endedAt: requireInteger(record.endedAt, "endedAt"),
    awardedExp: requireInteger(record.awardedExp, "awardedExp"),
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

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new SoloGameApiError(`${name} must be a non-empty string.`);
  }
  return value;
}

function requireStringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value)) throw new SoloGameApiError(`${name} must be an array.`);
  return value.map((item) => requireString(item, name));
}

function requirePlayMode(value: unknown): StartSoloSessionResponse["playMode"] {
  if (value !== "KEYBOARD" && value !== "AI") throw new SoloGameApiError("Invalid playMode.");
  return value;
}

function requireSymbolStatistics(value: unknown): SoloGameResult["symbolStatistics"] {
  if (!Array.isArray(value)) throw new SoloGameApiError("symbolStatistics must be an array.");
  return value.map((item) => {
    const record = requireRecord(item, "symbol statistic");
    return {
      symbol: requireString(record.symbol, "symbol"),
      correctCount: requireInteger(record.correctCount, "correctCount"),
      incorrectCount: requireInteger(record.incorrectCount, "incorrectCount"),
      confirmedCount: requireInteger(record.confirmedCount, "confirmedCount"),
    };
  });
}
