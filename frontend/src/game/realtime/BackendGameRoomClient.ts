export type BackendGameRoomStatus = "WAITING" | "IN_PROGRESS" | "CLOSED";
export type BackendGameType = "SIGN_DUEL" | "TETRIS_DUEL";

export interface BackendGameRoom {
  readonly id: number;
  readonly roomCode: string;
  readonly hostUserId: number;
  readonly guestUserId: number | null;
  readonly hostReady: boolean;
  readonly guestReady: boolean;
  readonly status: BackendGameRoomStatus;
  readonly participantCount: number;
  readonly capacity: number;
  readonly gameType: BackendGameType;
  readonly roomTitle: string;
  readonly hostName: string;
  readonly symbolRange: "CONSONANT" | "VOWEL" | "ALL";
  readonly realtimeTicket?: string;
}

export interface BackendGameRoomClientOptions {
  readonly apiBaseUrl: string;
  readonly userId: string;
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  readonly fetcher?: typeof globalThis.fetch;
}

export class BackendGameRoomClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(private readonly options: BackendGameRoomClientOptions) {
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  create(request: { readonly gameType: BackendGameType; readonly roomTitle: string; readonly symbolRange: "CONSONANT" | "VOWEL" | "ALL" }): Promise<BackendGameRoom> {
    return this.roomRequest("", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  join(roomCode: string): Promise<BackendGameRoom> {
    return this.roomRequest("/join", {
      method: "POST",
      body: JSON.stringify({ roomCode: roomCode.trim() }),
    });
  }

  ready(roomId: number, isReady: boolean): Promise<BackendGameRoom> {
    return this.roomRequest(`/${roomId}/ready`, {
      method: "POST",
      body: JSON.stringify({ isReady }),
    });
  }

  start(roomId: number): Promise<BackendGameRoom> {
    return this.roomRequest(`/${roomId}/start`, { method: "POST" });
  }

  async leave(roomId: number): Promise<void> {
    await this.request(`/${roomId}/leave`, { method: "POST" });
  }

  private async roomRequest(path: string, init: RequestInit): Promise<BackendGameRoom> {
    return parseBackendGameRoom(await this.request(path, init));
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const configured = typeof this.options.headers === "function"
      ? await this.options.headers()
      : this.options.headers ?? {};
    const headers = new Headers(configured);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    const separator = path.includes("?") ? "&" : "?";
    const response = await this.fetcher(
      `${this.baseUrl}/game-rooms${path}${separator}userId=${encodeURIComponent(this.options.userId)}`,
      { ...init, credentials: "include", headers },
    );
    if (!response.ok) {
      const detail = await readErrorDetail(response);
      throw new Error(`Game room request failed (${response.status})${detail ? `: ${detail}` : "."}`);
    }
    if (response.status === 204) return undefined;
    return response.json();
  }
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const contentType = response.headers?.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = await response.json() as unknown;
      if (isRecord(payload)) {
        for (const key of ["message", "detail", "error"]) {
          const value = payload[key];
          if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300);
        }
      }
      return "";
    }
    return (await response.text()).trim().slice(0, 300);
  } catch {
    return "";
  }
}

export function parseBackendGameRoom(value: unknown): BackendGameRoom {
  if (!isRecord(value)) throw new Error("Invalid game room response.");
  const status = value.status;
  if (status !== "WAITING" && status !== "IN_PROGRESS" && status !== "CLOSED") {
    throw new Error("Invalid game room status.");
  }
  const gameType = value.gameType;
  if (gameType !== "SIGN_DUEL" && gameType !== "TETRIS_DUEL") {
    throw new Error("Invalid game room type.");
  }
  const realtimeTicket = value.realtimeTicket;
  if (realtimeTicket !== undefined && realtimeTicket !== null && typeof realtimeTicket !== "string") {
    throw new Error("Invalid realtime ticket.");
  }
  const roomTitle = optionalText(value.title) ?? string(value.roomTitle, "roomTitle");
  const hostName = string(value.hostName, "hostName");
  const symbolRange = value.symbolRange;
  if (symbolRange !== "CONSONANT" && symbolRange !== "VOWEL" && symbolRange !== "ALL") {
    throw new Error("Invalid symbolRange.");
  }
  return {
    id: number(value.id, "id"),
    roomCode: string(value.roomCode, "roomCode"),
    hostUserId: number(value.hostUserId, "hostUserId"),
    guestUserId: value.guestUserId === null || value.guestUserId === undefined
      ? null
      : number(value.guestUserId, "guestUserId"),
    hostReady: boolean(value.hostReady, "hostReady"),
    guestReady: boolean(value.guestReady, "guestReady"),
    status,
    participantCount: number(value.participantCount, "participantCount"),
    capacity: number(value.capacity, "capacity"),
    gameType,
    roomTitle,
    hostName,
    symbolRange,
    ...(typeof realtimeTicket === "string" && realtimeTicket.length > 0 ? { realtimeTicket } : {}),
  };
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`Invalid ${name}.`);
  return value;
}
function string(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid ${name}.`);
  return value;
}
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid ${name}.`);
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
