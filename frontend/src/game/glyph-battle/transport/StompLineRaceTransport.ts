import { parseLineRaceEvent } from "../contracts";
import type { ClientLineRaceCommand, LineRaceConnectionOptions, LineRaceConnectionState, LineRaceTransport } from "./LineRaceTransport";
import type { StompClientFactory, StompClientLike, StompSubscriptionLike } from "../../block-stacking/battle/transport/StompBattleTransport";
import { matchBroadcastDestination, playerMatchDestination, resolveMatchChannelConfig, type MatchChannelConfig } from "../../match";
export interface StompLineRaceTransportOptions {
  readonly channels?: Partial<MatchChannelConfig>;
  readonly parseEvent?: typeof parseLineRaceEvent;
}
export class StompLineRaceTransport implements LineRaceTransport {
  private client:StompClientLike|null=null;private playerSub:StompSubscriptionLike|null=null;private matchSub:StompSubscriptionLike|null=null;private matchId:string|null=null;
  private awaitingInitialSnapshot=false;private pendingMatchEvents:ReturnType<typeof parseLineRaceEvent>[]=[];
  private state:LineRaceConnectionState="DISCONNECTED";private listeners=new Set<(event:ReturnType<typeof parseLineRaceEvent>)=>void>();private stateListeners=new Set<(state:LineRaceConnectionState)=>void>();
  private readonly channels:MatchChannelConfig;private readonly parseEvent:typeof parseLineRaceEvent;
  constructor(private readonly createClient:StompClientFactory,options:StompLineRaceTransportOptions={}){this.channels=resolveMatchChannelConfig(options.channels);this.parseEvent=options.parseEvent??parseLineRaceEvent;}
  connect(options:LineRaceConnectionOptions):Promise<void>{if(this.state==="CONNECTED")return Promise.resolve();this.setState("CONNECTING");const client=this.createClient(options.url);this.client=client;return new Promise((resolve,reject)=>client.connect({...options.headers,...(options.accessToken?{Authorization:`Bearer ${options.accessToken}`}:{})},()=>{this.playerSub=client.subscribe(playerMatchDestination(this.channels,options.playerId),(frame)=>this.receive(frame.body));this.setState("CONNECTED");resolve();},(cause)=>{this.setState("ERROR");reject(cause instanceof Error?cause:new Error("라인 레이스 WebSocket 연결에 실패했습니다."));}));}
  disconnect(){this.playerSub?.unsubscribe();this.matchSub?.unsubscribe();this.playerSub=null;this.matchSub=null;this.client?.disconnect();this.client=null;this.matchId=null;this.awaitingInitialSnapshot=false;this.pendingMatchEvents=[];this.setState("DISCONNECTED");}
  send(command:ClientLineRaceCommand){if(!this.client||this.state!=="CONNECTED")throw new Error("라인 레이스 WebSocket이 연결되지 않았습니다.");this.subscribeMatch(command.matchId);this.client.send(this.channels.commandDestination,{},JSON.stringify(command));}
  requestSnapshot(matchId:string){this.send({type:"LINE_RACE_SNAPSHOT_REQUEST",commandId:crypto.randomUUID(),matchId});}
  subscribe(listener:(event:ReturnType<typeof parseLineRaceEvent>)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  subscribeConnectionState(listener:(state:LineRaceConnectionState)=>void){this.stateListeners.add(listener);listener(this.state);return()=>this.stateListeners.delete(listener);}
  getConnectionState(){return this.state;}
  private receive(raw:string,fromMatchTopic=false){try{const event=this.parseEvent(raw);this.subscribeMatch(event.matchId);if(fromMatchTopic&&this.awaitingInitialSnapshot){this.pendingMatchEvents.push(event);return;}for(const listener of this.listeners)listener(event);if(event.type==="LINE_RACE_MATCH_SNAPSHOT"&&this.awaitingInitialSnapshot){this.awaitingInitialSnapshot=false;const pending=this.pendingMatchEvents.filter(item=>item.sequence>event.sequence).sort((a,b)=>a.sequence-b.sequence);this.pendingMatchEvents=[];for(const item of pending)for(const listener of this.listeners)listener(item);}}catch{this.setState("ERROR");}}
  private subscribeMatch(matchId:string){if(!this.client||this.matchId===matchId)return;this.matchSub?.unsubscribe();this.matchId=matchId;this.awaitingInitialSnapshot=true;this.pendingMatchEvents=[];this.matchSub=this.client.subscribe(matchBroadcastDestination(this.channels,matchId),(frame)=>this.receive(frame.body,true));}
  private setState(state:LineRaceConnectionState){if(this.state===state)return;this.state=state;for(const listener of this.stateListeners)listener(state);}
}
