import type { BackendGameRoomStatus, BackendGameType } from "./BackendGameRoomClient";
import type { RealtimeTicketClient } from "./RealtimeTicketClient";

export interface LobbyRoomSummary {
  readonly id: number;
  readonly roomCode: string;
  readonly status: BackendGameRoomStatus;
  readonly participantCount: number;
  readonly capacity: number;
  readonly gameType?: BackendGameType;
}

export interface LobbySseEvent {
  readonly type: "snapshot" | "update";
  readonly rooms: readonly LobbyRoomSummary[];
}

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
}

export interface LobbySseClientOptions {
  readonly apiBaseUrl: string;
  readonly ticketClient: Pick<RealtimeTicketClient, "issue">;
  readonly createEventSource?: (url: string) => EventSourceLike;
}

export class LobbySseClient {
  private source: EventSourceLike | null = null;
  private readonly listeners = new Set<(event: LobbySseEvent) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly baseUrl: string;
  private readonly createEventSource: (url: string) => EventSourceLike;

  constructor(private readonly options: LobbySseClientOptions) {
    this.baseUrl = options.apiBaseUrl.replace(/\/$/, "");
    this.createEventSource = options.createEventSource
      ?? ((url) => new EventSource(url) as unknown as EventSourceLike);
  }

  async connect(): Promise<void> {
    this.disconnect();
    const { ticket } = await this.options.ticketClient.issue();
    const source = this.createEventSource(
      `${this.baseUrl}/game-rooms/subscribe?ticket=${encodeURIComponent(ticket)}`,
    );
    this.source = source;
    for (const type of ["snapshot", "update"] as const) {
      source.addEventListener(type, (event) => this.receive(type, event.data));
    }
    source.onerror = () => {
      if (this.source !== source) return;
      source.close();
      this.source = null;
      this.emitError(new Error("Lobby SSE disconnected. A new one-use ticket is required."));
    };
  }

  subscribe(listener: (event: LobbySseEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  disconnect(): void {
    this.source?.close();
    this.source = null;
  }

  private receive(type: LobbySseEvent["type"], raw: string): void {
    try {
      const rooms = parseLobbyRooms(JSON.parse(raw));
      for (const listener of this.listeners) listener({ type, rooms });
    } catch (cause) {
      this.emitError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }
}

export function parseLobbyRooms(value: unknown): readonly LobbyRoomSummary[] {
  if (!isRecord(value) || !Array.isArray(value.rooms)) throw new Error("Invalid lobby room list.");
  return value.rooms.map((item) => {
    if (!isRecord(item)) throw new Error("Invalid lobby room.");
    const status = item.status;
    if (status !== "WAITING" && status !== "IN_PROGRESS" && status !== "CLOSED") throw new Error("Invalid lobby room status.");
    const gameType = item.gameType;
    if (gameType !== undefined && (typeof gameType !== "string" || gameType.trim().length === 0)) throw new Error("Invalid lobby game type.");
    return { id: integer(item.id), roomCode: text(item.roomCode), status, participantCount: integer(item.participantCount), capacity: integer(item.capacity), ...(gameType ? { gameType } : {}) };
  });
}
function integer(value: unknown): number { if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error("Invalid integer."); return value; }
function text(value: unknown): string { if (typeof value !== "string" || !value) throw new Error("Invalid text."); return value; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
