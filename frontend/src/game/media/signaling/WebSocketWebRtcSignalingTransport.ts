import { parseWebRtcSignalingMessage } from "./WebRtcSignalingMessageParser";
import type { ClientRtcSignalingMessage, ServerRtcSignalingMessage } from "./WebRtcSignalingMessages";
import type { WebRtcSignalingTransport } from "./WebRtcSignalingTransport";

export interface SignalingStompSubscription { unsubscribe(): void }
export interface SignalingStompClient {
  connect(headers: Readonly<Record<string, string>>, connected: () => void, failed: (error: unknown) => void): void;
  disconnect(callback?: () => void): void;
  subscribe(destination: string, listener: (frame: { readonly body: string }) => void): SignalingStompSubscription;
  send(destination: string, headers: Readonly<Record<string, string>>, body: string): void;
}

export interface WebSocketWebRtcSignalingTransportOptions {
  readonly url: string;
  readonly localUserId: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly createClient: (url: string) => SignalingStompClient;
}

export class WebSocketWebRtcSignalingTransport implements WebRtcSignalingTransport {
  private readonly listeners = new Set<(message: ServerRtcSignalingMessage) => void>();
  private client: SignalingStompClient | null = null;
  private subscription: SignalingStompSubscription | null = null;
  private pending: Promise<void> | null = null;
  private connected = false;

  constructor(private readonly options: WebSocketWebRtcSignalingTransportOptions) {}

  connect(): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (this.pending) return this.pending;
    const client = this.options.createClient(this.options.url);
    this.client = client;
    this.pending = new Promise<void>((resolve, reject) => {
      client.connect(this.options.headers ?? {}, () => {
        if (this.client !== client) return;
        this.subscription = client.subscribe(`/queue/game/rtc/${this.options.localUserId}`, (frame) => this.receive(frame.body));
        this.connected = true;
        this.pending = null;
        resolve();
      }, (cause) => {
        this.pending = null;
        reject(cause instanceof Error ? cause : new Error("RTC signaling connection failed."));
      });
    });
    return this.pending;
  }

  send(message: ClientRtcSignalingMessage): void {
    if (!this.client || !this.connected) throw new Error("RTC signaling transport is not connected.");
    this.client.send("/app/game/rtc/message", {}, JSON.stringify(message));
  }

  subscribe(listener: (message: ServerRtcSignalingMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.client?.disconnect();
    this.client = null;
    this.pending = null;
    this.connected = false;
  }

  private receive(raw: string): void {
    const message = parseWebRtcSignalingMessage(raw);
    for (const listener of this.listeners) listener(message);
  }
}
