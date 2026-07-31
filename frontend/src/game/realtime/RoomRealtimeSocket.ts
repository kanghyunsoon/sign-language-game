import { RealtimeTicketRequestError, type RealtimeTicketClient } from "./RealtimeTicketClient";

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
  readonly reconnectBudgetMs?: number;
  readonly now?: () => number;
  readonly wait?: (delayMs: number) => Promise<void>;
}

const OPEN = 1;
const CLOSED = 3;
// Finish before the backend's 10-second disconnect grace period so a
// successfully reopened socket still has time to be registered as reconnected.
const DEFAULT_RECONNECT_BUDGET_MS = 8_000;
const RETRY_DELAYS_MS = [0, 300, 600, 1_000, 1_500, 2_000, 2_500] as const;
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
  private readonly reconnectBudgetMs: number;
  private readonly now: () => number;
  private readonly wait: (delayMs: number) => Promise<void>;
  private connectionGeneration = 0;

  constructor(private readonly options: RoomRealtimeSocketOptions) {
    this.baseUrl = options.webSocketBaseUrl.replace(/\/$/, "");
    this.createWebSocket = options.createWebSocket
      ?? ((url) => new WebSocket(url) as unknown as RoomWebSocketLike);
    this.reconnectBudgetMs = options.reconnectBudgetMs ?? DEFAULT_RECONNECT_BUDGET_MS;
    this.now = options.now ?? Date.now;
    this.wait = options.wait ?? wait;
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

  /**
   * The documented Room WebSocket is also the authoritative participant
   * presence channel. Keep it open after WebRTC connects; Swagger permits
   * clients to send SIGNAL only and treats a close as a disconnect.
   */
  disconnectForWebRtcHandoff(): void {
    // Intentionally retained as a compatibility no-op for media-session callers.
  }

  disconnect(): void {
    this.close(1000, "CLIENT_CLOSED");
  }

  private async openWithFreshTicket(generation: number): Promise<void> {
    let lastError: Error | null = null;
    const deadlineAt = this.now() + this.reconnectBudgetMs;
    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      if (generation !== this.connectionGeneration) throw new Error("Room WebSocket connection was cancelled.");
      const remainingBeforeDelay = deadlineAt - this.now();
      if (remainingBeforeDelay <= 0) break;
      const configuredDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1) ?? 0;
      const delay = Math.min(configuredDelay, remainingBeforeDelay);
      if (delay > 0) await this.wait(delay);
      if (generation !== this.connectionGeneration) throw new Error("Room WebSocket connection was cancelled.");
      const remainingForAttempt = deadlineAt - this.now();
      if (remainingForAttempt <= 0) break;
      try {
        await this.openOnce(remainingForAttempt);
        return;
      } catch (cause) {
        lastError = cause instanceof Error ? cause : new Error(String(cause));
        // Retrying a rejected identity or an unusable one-time ticket only
        // burns tickets and obscures the actual stale-room condition.
        if (isTerminalAuthenticationFailure(cause)) break;
      }
    }
    const error = lastError ?? new Error("Room WebSocket connection failed.");
    this.emitError(error);
    throw error;
  }

  private async openOnce(handshakeTimeoutMs: number): Promise<void> {
    const { ticket } = await this.options.ticketClient.issue();
    const socket = this.createWebSocket(
      `${this.baseUrl}/${encodeURIComponent(this.options.roomId)}?ticket=${encodeURIComponent(ticket)}`,
    );
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = globalThis.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (this.socket === socket) this.socket = null;
        socket.close(4000, "CONNECT_TIMEOUT");
        reject(new Error("Room WebSocket connection timed out."));
      }, handshakeTimeoutMs);
      socket.onopen = () => {
        if (settled) {
          socket.close(4000, "LATE_OPEN");
          return;
        }
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve();
      };
      socket.onmessage = (event) => this.receive(event.data);
      socket.onerror = () => {
        // Browser WebSocket errors do not carry a useful cause.  Once the
        // handshake has completed, surfacing one as a connection failure
        // leaves the lobby showing a stale red error despite being connected.
        if (settled) return;
        const error = new Error("Room WebSocket connection failed.");
        settled = true;
        globalThis.clearTimeout(timeout);
        reject(error);
      };
      socket.onclose = () => {
        const wasCurrentSocket = this.socket === socket;
        if (wasCurrentSocket) this.socket = null;
        if (!settled) {
          settled = true;
          globalThis.clearTimeout(timeout);
          reject(new Error("Room WebSocket closed before connection."));
        } else if (wasCurrentSocket) {
          // An established presence connection closed unexpectedly. Re-enter
          // through connect() so every retry receives a fresh one-use ticket
          // and remains bounded by the eight-second reconnect budget.
          void this.connect().catch(() => undefined);
        }
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

function isTerminalAuthenticationFailure(cause: unknown): boolean {
  return cause instanceof RealtimeTicketRequestError
    ? cause.status === 401 || cause.status === 403
    : cause instanceof Error && /(?:ticket request failed \((?:401|403)\)|invalid.?ticket)/i.test(cause.message);
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
