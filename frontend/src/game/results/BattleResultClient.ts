export interface BattleResultResponse {
  readonly winnerUserId: number | null;
}

export interface BattleResultClientOptions {
  readonly apiBaseUrl: string;
  readonly userId: string;
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  readonly fetcher?: typeof globalThis.fetch;
}

export class BattleResultRequestError extends Error {
  constructor(readonly status: number, readonly responseBody: unknown) {
    super(`Battle result request failed (${status}).`);
    this.name = "BattleResultRequestError";
  }
}

export class BattleResultClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(private readonly options: BattleResultClientOptions) {
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async reportResult(roomId: number, winnerUserId: string | number | null): Promise<BattleResultResponse | null> {
    const configured = typeof this.options.headers === "function"
      ? await this.options.headers()
      : this.options.headers ?? {};
    const headers = new Headers(configured);
    headers.set("Content-Type", "application/json");
    const response = await this.fetcher(
      `${this.baseUrl}/game-rooms/${roomId}/results?userId=${encodeURIComponent(this.options.userId)}`,
      {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          winnerUserId: winnerUserId === null ? null : requiredUserId(winnerUserId),
        }),
      },
    );
    if (!response.ok) throw new BattleResultRequestError(response.status, await responseBody(response));
    return parseBattleResult(await response.json());
  }
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

function parseBattleResult(value: unknown): BattleResultResponse {
  if (!isRecord(value)) throw new Error("Invalid battle result response.");
  return {
    winnerUserId: value.winnerUserId === null ? null : integer(value.winnerUserId, "winnerUserId"),
  };
}
function requiredUserId(value: string | number): number {
  const userId = typeof value === "number" ? value : Number(value);
  return integer(userId, "winnerUserId");
}
function integer(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}.`);
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
