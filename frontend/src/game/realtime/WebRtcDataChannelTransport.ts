import type { MatchConnectionOptions, MatchModuleTransport } from "../match";
import type { GameDataChannel } from "../media/core/GameDataChannel";

export type WebRtcGameTransportState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";

interface GameEnvelope {
  readonly protocol: "GAME_P2P_V1";
  readonly roomId: string;
  readonly kind: "COMMAND" | "EVENT" | "SNAPSHOT";
  readonly payload: unknown;
}

/**
 * Typed game transport over the WebRTC DataChannel.  It deliberately has no
 * backend/WebSocket fallback: Room WebSocket is signaling-only after handoff.
 */
export class WebRtcDataChannelTransport<TCommand, TEvent>
  implements MatchModuleTransport<TCommand, TEvent, WebRtcGameTransportState> {
  private readonly eventListeners = new Set<(event: TEvent) => void>();
  private readonly commandListeners = new Set<(command: TCommand, remoteUserId: string) => void>();
  private readonly stateListeners = new Set<(state: WebRtcGameTransportState) => void>();
  private unsubscribeChannel: (() => void) | null = null;
  private unsubscribeChannelState: (() => void) | null = null;
  private state: WebRtcGameTransportState = "DISCONNECTED";
  private roomId: string | null = null;
  private connectionAttempt = 0;

  constructor(
    private readonly getChannel: () => GameDataChannel | null,
    private readonly acceptsEvent: (value: unknown) => value is TEvent,
  ) {}

  async connect(options: MatchConnectionOptions): Promise<void> {
    if (this.state === "CONNECTED" && this.roomId === options.roomId) return;
    this.disconnect();
    const attempt = ++this.connectionAttempt;
    this.roomId = options.roomId;
    this.setState("CONNECTING");
    const deadline = Date.now() + 15_000;
    let channel = this.getChannel();
    while (attempt === this.connectionAttempt && !channel?.isOpen() && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      channel = this.getChannel();
    }
    if (attempt !== this.connectionAttempt) return;
    if (!channel?.isOpen()) {
      this.setState("ERROR");
      throw new Error("WebRTC game channel is not ready.");
    }
    this.unsubscribeChannel = channel.subscribe((raw, remoteUserId) => this.receive(raw, remoteUserId));
    this.unsubscribeChannelState = channel.subscribeState?.((open) => {
      if (!open && this.state === "CONNECTED") this.setState("DISCONNECTED");
    }) ?? null;
    this.setState("CONNECTED");
  }

  disconnect(): void {
    this.connectionAttempt += 1;
    this.unsubscribeChannel?.();
    this.unsubscribeChannel = null;
    this.unsubscribeChannelState?.();
    this.unsubscribeChannelState = null;
    this.roomId = null;
    this.setState("DISCONNECTED");
  }

  send(command: TCommand): void {
    this.sendEnvelope("COMMAND", command);
  }

  sendEvent(event: TEvent): void {
    this.sendEnvelope("EVENT", event);
  }

  sendSnapshot(snapshot: TEvent): void {
    this.sendEnvelope("SNAPSHOT", snapshot);
  }

  /** Publishes an authoritative update locally and to every connected peer. */
  publishEvent(event: TEvent): void {
    this.emitEvent(event);
    this.sendEnvelope("EVENT", event);
  }

  /** Delivers a peer-owned relay to this browser without echoing it back. */
  publishLocal(event: TEvent): void {
    this.emitEvent(event);
  }

  /** Publishes a recovery snapshot locally and to every connected peer. */
  publishSnapshot(snapshot: TEvent): void {
    this.emitEvent(snapshot);
    this.sendEnvelope("SNAPSHOT", snapshot);
  }

  subscribe(listener: (event: TEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Host-only hook: commands include the authenticated WebRTC peer ID. */
  subscribeCommands(listener: (command: TCommand, remoteUserId: string) => void): () => void {
    this.commandListeners.add(listener);
    return () => this.commandListeners.delete(listener);
  }

  subscribeConnectionState(listener: (state: WebRtcGameTransportState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  getConnectionState(): WebRtcGameTransportState { return this.state; }
  getBufferedAmount(): number { return this.getChannel()?.getBufferedAmount?.() ?? 0; }

  private sendEnvelope(kind: GameEnvelope["kind"], payload: unknown): void {
    if (this.state !== "CONNECTED" || !this.roomId) throw new Error("WebRTC game transport is not connected.");
    const channel = this.getChannel();
    if (!channel?.isOpen()) {
      this.setState("ERROR");
      throw new Error("WebRTC game channel was disconnected.");
    }
    channel.send(JSON.stringify({ protocol: "GAME_P2P_V1", roomId: this.roomId, kind, payload } satisfies GameEnvelope));
  }

  private receive(raw: string, remoteUserId: string): void {
    try {
      const value: unknown = JSON.parse(raw);
      if (!isEnvelope(value) || value.roomId !== this.roomId) return;
      if (value.kind === "COMMAND") {
        for (const listener of this.commandListeners) listener(value.payload as TCommand, remoteUserId);
        return;
      }
      if (value.kind !== "EVENT" && value.kind !== "SNAPSHOT") return;
      if (!this.acceptsEvent(value.payload)) return;
      this.emitEvent(value.payload);
    } catch {
      this.setState("ERROR");
    }
  }

  private setState(next: WebRtcGameTransportState): void {
    if (this.state === next) return;
    this.state = next;
    for (const listener of this.stateListeners) listener(next);
  }

  private emitEvent(event: TEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }
}

function isEnvelope(value: unknown): value is GameEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<GameEnvelope>;
  return envelope.protocol === "GAME_P2P_V1" && typeof envelope.roomId === "string"
    && (envelope.kind === "COMMAND" || envelope.kind === "EVENT" || envelope.kind === "SNAPSHOT");
}
