import type { BattleGameTransport } from "./BattleGameTransport";
import { parseBattleMessage } from "./battleMessageParser";
import type { BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, ServerBattleMessage } from "./battleTransportTypes";

export interface BattleWebSocketLike {
  readonly readyState: number; readonly bufferedAmount: number;
  onopen: (() => void) | null; onclose: (() => void) | null; onerror: (() => void) | null; onmessage: ((event: { readonly data: string }) => void) | null;
  send(data: string): void; close(): void;
}
export type BattleWebSocketFactory = (url: string, protocols?: string | readonly string[]) => BattleWebSocketLike;

export class NativeWebSocketBattleTransport implements BattleGameTransport {
  private readonly listeners = new Set<(message: ServerBattleMessage) => void>();
  private readonly stateListeners = new Set<(state: BattleConnectionState) => void>();
  private socket: BattleWebSocketLike | null = null;
  private state: BattleConnectionState = "DISCONNECTED";
  private pending: Promise<void> | null = null;
  constructor(private readonly createSocket: BattleWebSocketFactory = (url, protocols) => new WebSocket(url, protocols as string[]) as unknown as BattleWebSocketLike) {}

  connect(options: BattleConnectionOptions): Promise<void> {
    if (this.state === "CONNECTED") return Promise.resolve();
    if (this.pending) return this.pending;
    this.setState(this.state === "RECONNECTING" ? "RECONNECTING" : "CONNECTING");
    const url = new URL(options.url);
    url.searchParams.set("roomId", options.roomId); url.searchParams.set("playerId", options.playerId);
    const socket = this.createSocket(url.toString(), options.accessToken ? ["bearer", options.accessToken] : undefined);
    this.socket = socket;
    this.pending = new Promise<void>((resolve, reject) => {
      socket.onopen = () => { if (this.socket !== socket) return; this.setState("CONNECTED"); this.pending = null; resolve(); };
      socket.onmessage = (event) => { try { const message = parseBattleMessage(event.data); for (const listener of this.listeners) listener(message); } catch { this.setState("ERROR"); } };
      socket.onerror = () => { if (this.socket !== socket) return; this.setState("ERROR"); this.pending = null; reject(new Error("Battle WebSocket connection failed.")); };
      socket.onclose = () => { if (this.socket !== socket) return; this.socket = null; this.pending = null; if (this.state !== "ERROR") this.setState("DISCONNECTED"); reject(new Error("Battle WebSocket closed before connection was established.")); };
    });
    return this.pending;
  }
  disconnect(): void { const socket = this.socket; this.socket = null; this.pending = null; socket?.close(); this.setState("DISCONNECTED"); }
  send(message: ClientBattleMessage): void { if (!this.socket || this.state !== "CONNECTED") throw new Error("Battle transport is not connected."); this.socket.send(JSON.stringify(message)); }
  subscribe(listener: (message: ServerBattleMessage) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeConnectionState(listener: (state: BattleConnectionState) => void): () => void { this.stateListeners.add(listener); listener(this.state); return () => this.stateListeners.delete(listener); }
  getConnectionState(): BattleConnectionState { return this.state; }
  getBufferedAmount(): number { return this.socket?.bufferedAmount ?? 0; }
  private setState(state: BattleConnectionState): void { if (this.state === state) return; this.state = state; for (const listener of this.stateListeners) listener(state); }
}
