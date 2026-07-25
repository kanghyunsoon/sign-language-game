export interface RealtimeTicket {
  readonly ticket: string;
  readonly expiresInSeconds: number;
}

export type RealtimeHeadersProvider = () => HeadersInit | Promise<HeadersInit>;

export interface RealtimeTicketClientOptions {
  readonly apiBaseUrl: string;
  readonly userId: string;
  readonly headers?: HeadersInit | RealtimeHeadersProvider;
  readonly fetcher?: typeof globalThis.fetch;
}

export class RealtimeTicketClient {
  private readonly apiBaseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(private readonly options: RealtimeTicketClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async issue(): Promise<RealtimeTicket> {
    const configured = typeof this.options.headers === "function"
      ? await this.options.headers()
      : this.options.headers ?? {};
    const url = `${this.apiBaseUrl}/auth/sse-ticket?userId=${encodeURIComponent(this.options.userId)}`;
    const response = await this.fetcher(url, {
      method: "POST",
      credentials: "include",
      headers: configured,
    });
    if (!response.ok) throw new Error(`Realtime ticket request failed (${response.status}).`);
    return parseRealtimeTicket(await response.json());
  }
}

export function parseRealtimeTicket(value: unknown): RealtimeTicket {
  if (!isRecord(value)
    || typeof value.ticket !== "string"
    || value.ticket.length === 0
    || typeof value.expiresInSeconds !== "number"
    || !Number.isFinite(value.expiresInSeconds)
    || value.expiresInSeconds <= 0) {
    throw new Error("Invalid realtime ticket response.");
  }
  return {
    ticket: value.ticket,
    expiresInSeconds: value.expiresInSeconds,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
