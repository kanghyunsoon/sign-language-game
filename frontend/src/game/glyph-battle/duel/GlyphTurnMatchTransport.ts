import type { MatchConnectionOptions, MatchModuleTransport } from "../../match";
import { matchBroadcastDestination, playerMatchDestination, resolveMatchChannelConfig, type MatchChannelConfig } from "../../match";
import type { StompClientFactory, StompClientLike, StompSubscriptionLike } from "../../block-stacking/battle/transport/StompBattleTransport";
import { parseGlyphTurnServerEvent } from "./GlyphTurnMessageParser";
import type { GlyphTurnChoiceCommand, GlyphTurnServerEvent } from "./GlyphTurnMatchContract";

export type GlyphTurnConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ERROR";
export interface GlyphTurnConnectionOptions extends MatchConnectionOptions { readonly matchId: string; }
export interface GlyphTurnMatchTransport extends MatchModuleTransport<GlyphTurnChoiceCommand, GlyphTurnServerEvent, GlyphTurnConnectionState, GlyphTurnConnectionOptions> { requestSnapshot(matchId:string):void }
export interface GlyphTurnMatchTransportFactory { create(roomId:string):GlyphTurnMatchTransport }

/** STOMP adapter for the backend-owned Glyph Turn Match contract. */
export class StompGlyphTurnMatchTransport implements GlyphTurnMatchTransport {
  private client: StompClientLike | null = null; private playerSub: StompSubscriptionLike | null = null; private matchSub: StompSubscriptionLike | null = null;
  private state: GlyphTurnConnectionState = "DISCONNECTED"; private readonly listeners = new Set<(event: GlyphTurnServerEvent) => void>(); private readonly stateListeners = new Set<(state: GlyphTurnConnectionState) => void>();
  private readonly channels: MatchChannelConfig;
  constructor(private readonly createClient: StompClientFactory, options: { readonly channels?: Partial<MatchChannelConfig> } = {}) { this.channels = resolveMatchChannelConfig(options.channels); }
  connect(options: GlyphTurnConnectionOptions): Promise<void> {
    if (this.state === "CONNECTED") return Promise.resolve();
    this.setState("CONNECTING"); this.client = this.createClient(options.url);
    return new Promise((resolve, reject) => this.client?.connect({ ...options.headers, ...(options.accessToken ? { Authorization:`Bearer ${options.accessToken}` } : {}) }, () => {
      this.playerSub = this.client?.subscribe(playerMatchDestination(this.channels, options.playerId), (frame) => this.receive(frame.body)) ?? null;
      this.matchSub = this.client?.subscribe(matchBroadcastDestination(this.channels, options.matchId), (frame) => this.receive(frame.body)) ?? null;
      this.setState("CONNECTED"); resolve();
    }, (cause) => { this.setState("ERROR"); reject(cause instanceof Error ? cause : new Error("지문자 턴 배틀 WebSocket 연결에 실패했습니다.")); }) ?? reject(new Error("지문자 턴 배틀 WebSocket 클라이언트를 만들지 못했습니다.")));
  }
  disconnect(): void { this.playerSub?.unsubscribe(); this.matchSub?.unsubscribe(); this.playerSub = null; this.matchSub = null; this.client?.disconnect(); this.client = null; this.setState("DISCONNECTED"); }
  send(command: GlyphTurnChoiceCommand): void { if (!this.client || this.state !== "CONNECTED") throw new Error("지문자 턴 배틀 WebSocket이 연결되지 않았습니다."); this.client.send(this.channels.commandDestination, {}, JSON.stringify(command)); }
  requestSnapshot(matchId:string):void{if(!this.client||this.state!=="CONNECTED")throw new Error("지문자 턴 배틀 WebSocket이 연결되지 않았습니다.");this.client.send(this.channels.commandDestination,{},JSON.stringify({type:"GLYPH_TURN_SNAPSHOT_REQUEST",commandId:crypto.randomUUID(),matchId}));}
  subscribe(listener: (event: GlyphTurnServerEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeConnectionState(listener: (state: GlyphTurnConnectionState) => void): () => void { this.stateListeners.add(listener); listener(this.state); return () => this.stateListeners.delete(listener); }
  getConnectionState(): GlyphTurnConnectionState { return this.state; }
  private receive(raw: string): void {
    try {
      // Glyph turns share the player queue with the normal match transport.
      // A LINE_RACE_* message is valid traffic for that connection, but not
      // for this adapter; it must not poison the glyph connection state.
      const message: unknown = JSON.parse(raw);
      if (
        !message ||
        typeof message !== "object" ||
        !("type" in message) ||
        typeof message.type !== "string" ||
        !message.type.startsWith("GLYPH_")
      )
        return;
      const event = parseGlyphTurnServerEvent(message);
      for (const listener of this.listeners) listener(event);
    } catch {
      this.setState("ERROR");
    }
  }
  private setState(state: GlyphTurnConnectionState): void { if (this.state === state) return; this.state = state; for (const listener of this.stateListeners) listener(state); }
}
