import type { RealtimeTicketClient } from "./RealtimeTicketClient";

export type RoomServerMessageType =
  | "PEER_DISCONNECTED"
  | "PEER_RECONNECTED"
  | "PEER_LEFT"
  | "GAME_STARTED"
  | "SIGNAL"
  | "ERROR";

export interface RoomServerMessage {
  readonly type: RoomServerMessageType;
  readonly payload: unknown;
}

export interface RoomWebSocketLike {
  readyState: number;
  onopen: (() => void) | null;
  onmessage: ((event: { readonly data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface RoomRealtimeSocketOptions {
  readonly webSocketBaseUrl: string;
  readonly roomId: string;
  readonly localUserId: string;
  readonly ticketClient: Pick<RealtimeTicketClient, "issue">;
  readonly createWebSocket?: (url: string) => RoomWebSocketLike;
}

const OPEN = 1;
const CLOSED = 3;
// A refreshed browser can race the server's cleanup of its previous signaling
// socket. Keep issuing one-time tickets throughout the room's 10-second rejoin
// grace period instead of giving up after roughly two seconds.
const RETRY_DELAYS_MS = [0, 350, 700, 1_200, 1_700, 2_200, 2_700] as const;
const MESSAGE_TYPES = new Set<RoomServerMessageType>([
  "PEER_DISCONNECTED", "PEER_RECONNECTED", "PEER_LEFT",
  "GAME_STARTED", "SIGNAL", "ERROR",
]);

export class RoomRealtimeSocket {
  private socket: RoomWebSocketLike | null = null;
  private pending: Promise<void> | null = null;
  private readonly listeners = new Set<(message: RoomServerMessage) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly baseUrl: string;
  private readonly createWebSocket: (url: string) => RoomWebSocketLike;
  private connectionGeneration = 0;

  constructor(private readonly options: RoomRealtimeSocketOptions) {
    this.baseUrl = options.webSocketBaseUrl.replace(/\/$/, "");
    this.createWebSocket = options.createWebSocket
      ?? ((url) => new WebSocket(url) as unknown as RoomWebSocketLike);
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === OPEN) return;
    if (this.pending) return this.pending;
    const generation = ++this.connectionGeneration;
    this.pending = this.openWithFreshTicket(generation);
    try {
      await this.pending;
    } finally {
      this.pending = null;
    }
  }

  sendSignal(payload: unknown): void {
    if (!this.socket || this.socket.readyState !== OPEN) throw new Error("Room WebSocket is not connected.");
    const enriched = isRecord(payload)
      ? { ...payload, senderUserId: this.options.localUserId }
      : { senderUserId: this.options.localUserId, value: payload };
    this.socket.send(JSON.stringify({ type: "SIGNAL", payload: enriched }));
  }

  subscribe(listener: (message: RoomServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /** Called only after RTCPeerConnection and its DataChannel are both ready. */
  disconnectForWebRtcHandoff(): void {
    this.close(1000, "WEBRTC_ESTABLISHED");
  }

  disconnect(): void {
    this.close(1000, "CLIENT_CLOSED");
  }

  private async openWithFreshTicket(generation: number): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      if (generation !== this.connectionGeneration) throw new Error("Room WebSocket connection was cancelled.");
      const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 0;
      if (delay > 0) await wait(delay);
      if (generation !== this.connectionGeneration) throw new Error("Room WebSocket connection was cancelled.");
      try {
        await this.openOnce();
        return;
      } catch (cause) {
        lastError = cause instanceof Error ? cause : new Error(String(cause));
      }
    }
    const error = lastError ?? new Error("Room WebSocket connection failed.");
    this.emitError(error);
    throw error;
  }

  private async openOnce(): Promise<void> {
    const { ticket } = await this.options.ticketClient.issue();
    const socket = this.createWebSocket(
      `${this.baseUrl}/${encodeURIComponent(this.options.roomId)}?ticket=${encodeURIComponent(ticket)}`,
    );
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      socket.onopen = () => { settled = true; resolve(); };
      socket.onmessage = (event) => this.receive(event.data);
      socket.onerror = () => {
        // Browser WebSocket errors do not carry a useful cause.  Once the
        // handshake has completed, surfacing one as a connection failure
        // leaves the lobby showing a stale red error despite being connected.
        if (settled) return;
        const error = new Error("Room WebSocket connection failed.");
        settled = true;
        reject(error);
      };
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null;
        if (!settled) { settled = true; reject(new Error("Room WebSocket closed before connection.")); }
      };
    });
  }

  private receive(raw: string): void {
    try {
      const message = parseRoomServerMessage(raw);
      for (const listener of this.listeners) listener(message);
    } catch (cause) {
      this.emitError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }

  private close(code: number, reason: string): void {
    this.connectionGeneration += 1;
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== CLOSED) socket.close(code, reason);
  }

  private emitError(error: Error): void { for (const listener of this.errorListeners) listener(error); }
}

function wait(delayMs: number): Promise<void> { return new Promise((resolve) => window.setTimeout(resolve, delayMs)); }

export function parseRoomServerMessage(raw: string): RoomServerMessage {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || typeof value.type !== "string" || !MESSAGE_TYPES.has(value.type as RoomServerMessageType) || !("payload" in value)) {
    throw new Error("Invalid room WebSocket message.");
  }
  return { type: value.type as RoomServerMessageType, payload: value.payload };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
