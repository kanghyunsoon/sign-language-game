export interface RankingEntry {
  readonly rank: number;
  readonly userId: number;
  readonly nickname: string;
  readonly winCount: number;
  readonly lossCount: number;
}
export interface RankingResponse {
  readonly top: readonly RankingEntry[];
  readonly me: RankingEntry | null;
}
export interface RankingClientOptions {
  readonly apiBaseUrl: string;
  readonly userId: string;
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  readonly fetcher?: typeof globalThis.fetch;
}

export class RankingClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  constructor(private readonly options: RankingClientOptions) {
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }
  async get(): Promise<RankingResponse> {
    const headers = typeof this.options.headers === "function"
      ? await this.options.headers()
      : this.options.headers ?? {};
    const response = await this.fetcher(
      `${this.baseUrl}/rankings?userId=${encodeURIComponent(this.options.userId)}`,
      { credentials: "include", headers },
    );
    if (!response.ok) throw new Error(`Ranking request failed (${response.status}).`);
    return parseRankingResponse(await response.json());
  }
}

export function parseRankingResponse(value: unknown): RankingResponse {
  if (!isRecord(value) || !Array.isArray(value.top)) throw new Error("Invalid ranking response.");
  return {
    top: value.top.map(parseEntry),
    me: value.me === null || value.me === undefined ? null : parseEntry(value.me),
  };
}
function parseEntry(value: unknown): RankingEntry {
  if (!isRecord(value)) throw new Error("Invalid ranking entry.");
  return {
    rank: integer(value.rank, "rank"),
    userId: integer(value.userId, "userId"),
    nickname: text(value.nickname, "nickname"),
    winCount: integer(value.winCount, "winCount"),
    lossCount: integer(value.lossCount, "lossCount"),
  };
}
function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}.`);
  return value;
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${name}.`);
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
