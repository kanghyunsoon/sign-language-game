import type { BattleGameTransport } from "../transport/BattleGameTransport";
import type { BattleBodyTransform, BattleConnectionOptions, BattleConnectionState, ClientBattleMessage, ServerBattleMessage } from "../transport/battleTransportTypes";
import { isCompetitiveRecognitionReady } from "../../../recognition/readiness/recognitionReadiness";

const SYMBOLS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"].filter(isCompetitiveRecognitionReady);

/** 서버 없이 기존 BattleController와 동기화 계약을 검증하는 개발용 상대다. */
export class LocalBattleBotTransport implements BattleGameTransport {
  private readonly listeners=new Set<(message:ServerBattleMessage)=>void>();
  private readonly stateListeners=new Set<(state:BattleConnectionState)=>void>();
  private state:BattleConnectionState="DISCONNECTED";
  private timers=new Set<ReturnType<typeof setTimeout>>();
  private options:BattleConnectionOptions|null=null;
  private sequence=0;private spawnIndex=0;private score=0;private combo=0;private botScore=0;
  private readonly matchId="block-bot-practice";private readonly botPlayerId="BLOCK_PRACTICE_BOT";
  private remoteBodies:BattleBodyTransform[]=[];

  async connect(options:BattleConnectionOptions):Promise<void>{
    if(this.state==="CONNECTED")return;this.options=options;this.setState("CONNECTING");this.setState("CONNECTED");
    this.later(()=>this.startMatch(),50);
  }
  disconnect():void{this.clearTimers();this.options=null;this.remoteBodies=[];this.setState("DISCONNECTED");}
  send(message:ClientBattleMessage):void{
    if(this.state!=="CONNECTED")throw new Error("블록 봇 연습 연결이 종료되었습니다.");
    if(message.type==="REMOVE_LETTER_COMMAND")this.acceptRemoval(message);
    if(message.type==="PLAYER_GAME_OVER_COMMAND")this.finishPracticeMatch();
  }
  subscribe(listener:(message:ServerBattleMessage)=>void):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  subscribeConnectionState(listener:(state:BattleConnectionState)=>void):()=>void{this.stateListeners.add(listener);listener(this.state);return()=>this.stateListeners.delete(listener);}
  getConnectionState():BattleConnectionState{return this.state;}

  private startMatch(){
    const playerId=this.options?.playerId;if(!playerId||this.state!=="CONNECTED")return;
    // Local practice has no server clock to synchronize with. Start in the
    // same task so camera/MediaPipe work cannot starve a countdown timer.
    const startedAt=Date.now();
    this.emit({type:"MATCH_STARTED",sequence:++this.sequence,matchId:this.matchId,roomId:this.options!.roomId,playerIds:[playerId,this.botPlayerId],startAt:startedAt,serverTime:startedAt});
    this.spawnLocal();this.spawnBot();this.spawnBot();this.spawnBot();this.scheduleLocalSpawn();this.scheduleBotTurn();
  }
  private scheduleLocalSpawn(){this.later(()=>{this.spawnLocal();this.scheduleLocalSpawn();},1800);}
  private scheduleBotTurn(){this.later(()=>{const target=this.remoteBodies[0];if(target){this.remoteBodies=this.remoteBodies.slice(1);this.botScore+=100;this.emit({type:"SCORE_UPDATED",sequence:++this.sequence,playerId:this.botPlayerId,score:this.botScore});}this.spawnBot();if(this.options&&this.botScore>0&&this.botScore%300===0)this.emit({type:"ATTACK_CREATED",sequence:++this.sequence,attackId:`bot-attack-${this.sequence}`,attackerPlayerId:this.botPlayerId,targetPlayerId:this.options.playerId,attackType:"SHAKE",amount:1,sourceCombo:this.botScore/100,createdAt:Date.now()});this.scheduleBotTurn();},1800);}
  private spawnLocal(){
    if(!this.options)return;const index=this.spawnIndex++,symbol=SYMBOLS[index%SYMBOLS.length]!;
    this.emit({type:"SPAWN_LETTER",sequence:++this.sequence,matchId:this.matchId,playerId:this.options.playerId,letterId:`practice-local-${index}`,spawnIndex:index,symbol,spawnAt:Date.now(),normalizedX:.12+(index%6)*.15,initialAngle:0});
  }
  private spawnBot(){
    const index=this.spawnIndex++,symbol=SYMBOLS[(index*3)%SYMBOLS.length]!;
    this.remoteBodies=[...this.remoteBodies.slice(-7),{id:`practice-bot-${index}`,symbol,x:.18+(index%5)*.16,y:.82-(this.remoteBodies.length%3)*.18,angle:0,velocityX:0,velocityY:0,angularVelocity:0,state:"SETTLED"}];
    this.emit({type:"BOARD_SNAPSHOT",sequence:++this.sequence,matchId:this.matchId,playerId:this.botPlayerId,sentAt:Date.now(),bodies:this.remoteBodies});
  }
  /** 수달이 봇 판의 실제 현재 목표 블록을 집어 간다. */
  takeBotTargetForOtter(): { readonly symbol: string; readonly nextSymbol: string | null } | null {
    if(!this.options||this.state!=="CONNECTED")return null;
    const target=this.remoteBodies[0];
    if(!target)return null;
    this.remoteBodies=this.remoteBodies.slice(1);
    this.emit({type:"BOARD_SNAPSHOT",sequence:++this.sequence,matchId:this.matchId,playerId:this.botPlayerId,sentAt:Date.now(),bodies:this.remoteBodies});
    return {symbol:target.symbol,nextSymbol:this.remoteBodies[0]?.symbol??null};
  }
  /** 수달 연출에서 전달된 글자를 봇의 실제 최우선 목표 블록으로 올린다. */
  injectOtterTargetForBot(symbol:string):void{
    if(!this.options||this.state!=="CONNECTED")return;
    const index=this.spawnIndex++;
    const body:BattleBodyTransform={id:`otter-bot-target-${index}`,symbol,x:.5,y:.11,angle:0,velocityX:0,velocityY:0,angularVelocity:0,state:"SETTLED"};
    this.remoteBodies=[body,...this.remoteBodies].slice(0,8);
    this.emit({type:"BOARD_SNAPSHOT",sequence:++this.sequence,matchId:this.matchId,playerId:this.botPlayerId,sentAt:Date.now(),bodies:this.remoteBodies});
  }
  /** 반대 방향 수달 전달은 플레이어 판에도 실제 목표 블록을 생성한다. */
  injectOtterTargetForPlayer(symbol:string):void{
    if(!this.options||this.state!=="CONNECTED")return;
    const index=this.spawnIndex++;
    this.emit({type:"SPAWN_LETTER",sequence:++this.sequence,matchId:this.matchId,playerId:this.options.playerId,letterId:`otter-player-target-${index}`,spawnIndex:index,symbol,spawnAt:Date.now()-60_000,normalizedX:.5,initialAngle:0});
  }
  private acceptRemoval(message:Extract<ClientBattleMessage,{type:"REMOVE_LETTER_COMMAND"}>){
    this.score+=100;this.combo+=1;
    this.emit({type:"REMOVE_LETTER_ACCEPTED",sequence:++this.sequence,commandId:message.commandId,playerId:this.options!.playerId,letterId:message.letterId,symbol:message.symbol,score:this.score,combo:this.combo,maxCombo:this.combo,removedCount:this.score/100,acceptedAt:Date.now()});
    this.later(()=>this.spawnLocal(),250);
  }
  private finishPracticeMatch(){
    const playerId=this.options?.playerId;if(!playerId)return;
    this.clearTimers();const finishedAt=Date.now();
    this.emit({type:"MATCH_FINISHED",sequence:++this.sequence,matchId:this.matchId,winnerPlayerId:this.botPlayerId,loserPlayerId:playerId,reason:"DANGER_LINE",finishedAt,results:[{playerId,score:this.score,maxCombo:this.combo,removedCount:this.score/100,attackCount:0},{playerId:this.botPlayerId,score:this.botScore,maxCombo:0,removedCount:this.botScore/100,attackCount:0}]});
  }
  private later(callback:()=>void,delay:number){const timer=setTimeout(()=>{this.timers.delete(timer);if(this.state==="CONNECTED")callback();},delay);this.timers.add(timer);}
  private clearTimers(){this.timers.forEach(clearTimeout);this.timers.clear();}
  private emit(message:ServerBattleMessage){this.listeners.forEach((listener)=>listener(message));}
  private setState(state:BattleConnectionState){this.state=state;this.stateListeners.forEach((listener)=>listener(state));}
}
