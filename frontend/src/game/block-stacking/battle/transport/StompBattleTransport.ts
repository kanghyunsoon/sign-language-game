import type { BattleGameTransport } from "./BattleGameTransport";
import { parseBattleMessage } from "./battleMessageParser";
import type { BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, ServerBattleMessage } from "./battleTransportTypes";
import { matchBroadcastDestination, playerMatchDestination, resolveMatchChannelConfig, type MatchChannelConfig } from "../../../match";

export interface StompSubscriptionLike { unsubscribe(): void; }
export interface StompClientLike {
  connect(headers: Readonly<Record<string, string>>, onConnect: () => void, onError: (error: unknown) => void): void;
  disconnect(callback?: () => void): void;
  subscribe(destination: string, listener: (frame: { readonly body: string }) => void): StompSubscriptionLike;
  send(destination: string, headers: Readonly<Record<string, string>>, body: string): void;
}
export type StompClientFactory = (url: string) => StompClientLike;
export interface StompBattleTransportOptions {
  readonly channels?: Partial<MatchChannelConfig>;
  readonly parseMessage?: (body: string) => ServerBattleMessage;
}

export class StompBattleTransport implements BattleGameTransport {
  private readonly listeners = new Set<(message: ServerBattleMessage) => void>();
  private readonly stateListeners = new Set<(state: BattleConnectionState) => void>();
  private client: StompClientLike | null = null; private playerSubscription: StompSubscriptionLike | null = null; private matchSubscription: StompSubscriptionLike | null = null; private subscribedMatchId: string | null = null;
  private state: BattleConnectionState = "DISCONNECTED"; private options: BattleConnectionOptions | null = null; private pending: Promise<void> | null = null;
  private readonly channels: MatchChannelConfig;
  private readonly parseMessage: (body: string) => ServerBattleMessage;
  constructor(private readonly createClient: StompClientFactory, options: StompBattleTransportOptions = {}) {
    this.channels = resolveMatchChannelConfig(options.channels);
    this.parseMessage = options.parseMessage ?? parseBattleMessage;
  }
  connect(options: BattleConnectionOptions): Promise<void> {
    if (this.state === "CONNECTED") return Promise.resolve(); if (this.pending) return this.pending;
    this.options = options; this.setState("CONNECTING"); const client = this.createClient(options.url); this.client = client;
    this.pending = new Promise<void>((resolve, reject) => client.connect({ ...(options.headers ?? {}), ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}) }, () => {
      if (this.client !== client) return;
      this.playerSubscription = client.subscribe(playerMatchDestination(this.channels, options.playerId), (frame) => this.receive(frame.body));
      this.setState("CONNECTED"); this.pending = null; resolve();
    }, (error) => { this.setState("ERROR"); this.pending = null; reject(error instanceof Error ? error : new Error("STOMP connection failed.")); }));
    return this.pending;
  }
  disconnect(): void { this.playerSubscription?.unsubscribe(); this.matchSubscription?.unsubscribe(); this.playerSubscription = null; this.matchSubscription = null; this.subscribedMatchId = null; this.client?.disconnect(); this.client = null; this.pending = null; this.setState("DISCONNECTED"); }
  send(message: ClientBattleMessage): void { if (!this.client || !this.options || this.state !== "CONNECTED") throw new Error("Battle transport is not connected."); this.client.send(this.channels.commandDestination, {}, JSON.stringify(message)); }
  subscribe(listener: (message: ServerBattleMessage) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeConnectionState(listener: (state: BattleConnectionState) => void): () => void { this.stateListeners.add(listener); listener(this.state); return () => this.stateListeners.delete(listener); }
  getConnectionState(): BattleConnectionState { return this.state; }
  private receive(body: string): void {
    try {
      const parsed = this.parseMessage(body);
      if ("matchId" in parsed) this.subscribeToMatch(parsed.matchId);
      for (const listener of this.listeners) listener(parsed);
    } catch (cause) {
      if (import.meta.env.DEV) console.warn("[battle-transport] rejected server message", cause, body);
      this.setState("ERROR");
    }
  }
  private subscribeToMatch(matchId: string): void {
    if (!this.client || this.subscribedMatchId === matchId) return;
    this.matchSubscription?.unsubscribe();
    this.subscribedMatchId = matchId;
    this.matchSubscription = this.client.subscribe(matchBroadcastDestination(this.channels, matchId), (frame) => this.receive(frame.body));
  }
  private setState(state: BattleConnectionState): void { if (this.state === state) return; this.state = state; for (const listener of this.stateListeners) listener(state); }
}
