import type { GameDataChannel } from "../../../media/core/GameDataChannel";
import { WebRtcDataChannelTransport } from "../../../realtime/WebRtcDataChannelTransport";
import { BattleP2pAuthority, type BattleP2pAuthorityOptions } from "./BattleP2pAuthority";
import type { BattleGameTransport } from "../transport/BattleGameTransport";
import { parseBattleMessage } from "../transport/battleMessageParser";
import type {
  BattleConnectionOptions,
  BattleConnectionState,
  ClientBattleMessage,
  ServerBattleMessage,
} from "../transport/battleTransportTypes";

/** Board mirror messages relayed verbatim between the two clients (not adjudicated by the host). */
const RELAY_TYPES = new Set(["BODY_TRANSFORM_BATCH", "BOARD_SNAPSHOT", "LETTER_SPAWNED_SYNC", "LETTER_STATE_SYNC", "LETTER_REMOVED_SYNC"]);

const DEFAULT_AUTO_START_DELAY_MS = 300;

export interface P2pBattleTransportOptions {
  readonly localPlayerId: string;
  readonly hostUserId: string;
  readonly playerIds: readonly [string, string];
  readonly getChannel: () => GameDataChannel | null;
  readonly matchId?: string;
  readonly authorityOptions?: BattleP2pAuthorityOptions;
  readonly autoStartDelayMs?: number;
  readonly setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

/**
 * P2P block-stacking transport over the WebRTC DataChannel.  The host browser owns match
 * authority (BattleP2pAuthority); the guest sends commands and receives authoritative
 * events.  Room WebSocket is never used for gameplay after WebRTC handoff.
 */
export class P2pBattleTransport implements BattleGameTransport {
  private readonly listeners = new Set<(message: ServerBattleMessage) => void>();
  private readonly stateListeners = new Set<(state: BattleConnectionState) => void>();
  private readonly core: WebRtcDataChannelTransport<ClientBattleMessage, ServerBattleMessage>;
  private readonly setTimer: NonNullable<P2pBattleTransportOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<P2pBattleTransportOptions["clearTimer"]>;
  private unsubscribeEvent: (() => void) | null = null;
  private unsubscribeCommand: (() => void) | null = null;
  private unsubscribeAuthority: (() => void) | null = null;
  private authority: BattleP2pAuthority | null = null;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private options: BattleConnectionOptions | null = null;
  private state: BattleConnectionState = "DISCONNECTED";

  constructor(private readonly configuration: P2pBattleTransportOptions) {
    this.core = new WebRtcDataChannelTransport(configuration.getChannel, isServerBattleMessage);
    this.setTimer = configuration.setTimer ?? setTimeout;
    this.clearTimer = configuration.clearTimer ?? clearTimeout;
  }

  async connect(options: BattleConnectionOptions): Promise<void> {
    if (this.state === "CONNECTED" && this.options?.roomId === options.roomId) return;
    this.disconnect();
    this.options = options;
    this.setState("CONNECTING");
    try {
      await this.core.connect(options);
      this.unsubscribeEvent = this.core.subscribe((event) => this.emit(event));
      if (this.isHost()) this.startAuthority(options);
      this.setState("CONNECTED");
    } catch (cause) {
      this.setState("ERROR");
      throw cause;
    }
  }

  disconnect(): void {
    if (this.startTimer) { this.clearTimer(this.startTimer); this.startTimer = null; }
    this.unsubscribeEvent?.(); this.unsubscribeEvent = null;
    this.unsubscribeCommand?.(); this.unsubscribeCommand = null;
    this.unsubscribeAuthority?.(); this.unsubscribeAuthority = null;
    this.authority?.dispose(); this.authority = null;
    this.options = null;
    this.core.disconnect();
    this.setState("DISCONNECTED");
  }

  send(message: ClientBattleMessage): void {
    if (this.state !== "CONNECTED") throw new Error("WebRTC 블록 대전 채널이 연결되지 않았습니다.");
    if (this.isHost()) {
      if (isRelay(message)) { this.core.sendEvent(message as unknown as ServerBattleMessage); return; }
      if (message.type === "REQUEST_MATCH_STATE") { this.authority?.ensureStarted(); return; }
      this.authority?.submit(this.configuration.localPlayerId, message);
      return;
    }
    this.core.send(message);
  }

  subscribe(listener: (message: ServerBattleMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeConnectionState(listener: (state: BattleConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  getConnectionState(): BattleConnectionState { return this.state; }

  getBufferedAmount(): number { return 0; }

  private startAuthority(options: BattleConnectionOptions): void {
    const matchId = this.configuration.matchId ?? options.roomId;
    this.authority = new BattleP2pAuthority(matchId, options.roomId, this.configuration.playerIds, this.configuration.authorityOptions);
    this.unsubscribeAuthority = this.authority.subscribe((event) => {
      this.emit(event);
      if (event.type === "BOARD_SNAPSHOT") this.core.sendSnapshot(event);
      else this.core.sendEvent(event);
    });
    this.unsubscribeCommand = this.core.subscribeCommands((command, remoteUserId) => {
      if (isRelay(command)) { this.emit(command as unknown as ServerBattleMessage); return; }
      if (command.type === "REQUEST_MATCH_STATE") { this.authority?.ensureStarted(); return; }
      this.authority?.submit(remoteUserId, command);
    });
    // Fallback start once both peers are present (DataChannel open ⇒ guest connected).
    this.startTimer = this.setTimer(() => { this.startTimer = null; this.authority?.ensureStarted(); }, this.configuration.autoStartDelayMs ?? DEFAULT_AUTO_START_DELAY_MS);
  }

  private isHost(): boolean { return this.configuration.localPlayerId === this.configuration.hostUserId; }
  private emit(message: ServerBattleMessage): void { for (const listener of this.listeners) listener(message); }
  private setState(state: BattleConnectionState): void { if (this.state === state) return; this.state = state; for (const listener of this.stateListeners) listener(state); }
}

function isRelay(message: { readonly type: string }): boolean { return RELAY_TYPES.has(message.type); }

function isServerBattleMessage(value: unknown): value is ServerBattleMessage {
  try { parseBattleMessage(value); return true; } catch { return false; }
}
