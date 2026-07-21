import type {
  CompleteSoloSessionRequest,
  SoloGameApi,
  SoloGameResult,
  SoloSymbolStatistic,
  StartSoloSessionRequest,
  StartSoloSessionResponse,
} from "./SoloGameApi";

export type SoloFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type SoloHeadersProvider = () => HeadersInit | Promise<HeadersInit>;

export interface HttpSoloGameApiOptions {
  readonly baseUrl?: string;
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

export class HttpSoloGameApi implements SoloGameApi {
  private readonly baseUrl: string;
  private readonly fetcher: SoloFetch;
  private readonly credentials: RequestCredentials;
  private readonly configuredHeaders: HeadersInit | SoloHeadersProvider;

  constructor(options: HttpSoloGameApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.credentials = options.credentials ?? "same-origin";
    this.configuredHeaders = options.headers ?? {};
  }

  async startSession(request: StartSoloSessionRequest): Promise<StartSoloSessionResponse> {
    return parseStartResponse(await this.request("/game/solo/sessions", {
      method: "POST",
      body: JSON.stringify(request),
    }));
  }

  async completeSession(soloSessionId: string, request: CompleteSoloSessionRequest): Promise<SoloGameResult> {
    return parseResult(await this.request(`/game/solo/sessions/${encodeURIComponent(soloSessionId)}/complete`, {
      method: "POST",
      body: JSON.stringify(request),
    }));
  }

  async getResults(): Promise<readonly SoloGameResult[]> {
    const payload = await this.request("/game/solo/results", {});
    if (!Array.isArray(payload)) throw new SoloGameApiError("Solo result response must be an array.");
    return payload.map(parseResult);
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const configured = typeof this.configuredHeaders === "function"
      ? await this.configuredHeaders()
      : this.configuredHeaders;
    const headers = new Headers(configured);
    if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

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

function parseStartResponse(value: unknown): StartSoloSessionResponse {
  const record = requireRecord(value, "start session");
  return {
    soloSessionId: requireString(record.soloSessionId, "soloSessionId"),
    userId: requireString(record.userId, "userId"),
    difficulty: requireString(record.difficulty, "difficulty"),
    symbolRange: requireStringArray(record.symbolRange, "symbolRange"),
    playMode: requirePlayMode(record.playMode),
    startedAt: requireNumber(record.startedAt, "startedAt"),
  };
}

function parseResult(value: unknown): SoloGameResult {
  const record = requireRecord(value, "solo result");
  return {
    soloSessionId: requireString(record.soloSessionId, "soloSessionId"),
    userId: requireString(record.userId, "userId"),
    playMode: requirePlayMode(record.playMode),
    difficulty: requireString(record.difficulty, "difficulty"),
    finalScore: requireNumber(record.finalScore, "finalScore"),
    maxCombo: requireNumber(record.maxCombo, "maxCombo"),
    removedSymbolCount: requireNumber(record.removedSymbolCount, "removedSymbolCount"),
    playDurationMs: requireNumber(record.playDurationMs, "playDurationMs"),
    symbolStatistics: requireStatistics(record.symbolStatistics),
    startedAt: requireNumber(record.startedAt, "startedAt"),
    endedAt: requireNumber(record.endedAt, "endedAt"),
  };
}

function requireStatistics(value: unknown): readonly SoloSymbolStatistic[] {
  if (!Array.isArray(value)) throw new SoloGameApiError("symbolStatistics must be an array.");
  return value.map((item) => {
    const record = requireRecord(item, "symbol statistic");
    return {
      symbol: requireString(record.symbol, "symbol"),
      correctCount: requireNumber(record.correctCount, "correctCount"),
      incorrectCount: requireNumber(record.incorrectCount, "incorrectCount"),
      confirmedCount: requireNumber(record.confirmedCount, "confirmedCount"),
    };
  });
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SoloGameApiError(`${name} response must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string") throw new SoloGameApiError(`${name} must be a string.`);
  return value;
}

function requireNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new SoloGameApiError(`${name} must be finite.`);
  return value;
}

function requireStringArray(value: unknown, name: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new SoloGameApiError(`${name} must be a string array.`);
  }
  return value as string[];
}

function requirePlayMode(value: unknown): "KEYBOARD" | "AI" {
  if (value !== "KEYBOARD" && value !== "AI") throw new SoloGameApiError("playMode is invalid.");
  return value;
}
