import type { GameResultRepository, GameResultSubmission, PersistedSymbolStatistic, StoredGameResult } from "./types";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export type RequestHeadersProvider = () => HeadersInit | Promise<HeadersInit>;

export interface HttpGameResultRepositoryOptions {
  readonly baseUrl?: string;
  readonly fetcher?: FetchLike;
  readonly credentials?: RequestCredentials;
  readonly headers?: HeadersInit | RequestHeadersProvider;
}

export class GameResultRepositoryError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "GameResultRepositoryError";
  }
}

export class HttpGameResultRepository implements GameResultRepository {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly credentials: RequestCredentials;
  private readonly configuredHeaders: HeadersInit | RequestHeadersProvider;

  constructor(options: HttpGameResultRepositoryOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
    this.credentials = options.credentials ?? "same-origin";
    this.configuredHeaders = options.headers ?? {};
  }

  save(result: GameResultSubmission): Promise<StoredGameResult> {
    return this.request("/game-results", { method: "POST", body: JSON.stringify(result) });
  }

  listMine(): Promise<readonly StoredGameResult[]> {
    return this.request("/game-results/me", {});
  }

  getMyBest(): Promise<StoredGameResult | null> {
    return this.request("/game-results/me/best", {}, true);
  }

  getMySignStatistics(): Promise<readonly PersistedSymbolStatistic[]> {
    return this.request("/sign-statistics/me", {});
  }

  private async request<T>(path: string, init: RequestInit, nullable = false): Promise<T> {
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
    } catch {
      throw new GameResultRepositoryError("Game result API is unavailable.");
    }
    if (nullable && response.status === 404) return null as T;
    if (!response.ok) throw new GameResultRepositoryError(`Game result API returned ${response.status}.`, response.status);
    return await response.json() as T;
  }
}
