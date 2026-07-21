import type { LineRaceServerEvent } from "../contracts";
import { elementalModifier, getGlyphCombatRule, type GlyphAttackKind, type GlyphMoveRole } from "./GlyphCombatRules";
import type { GlyphTurnServerEvent } from "./GlyphTurnMatchContract";

interface FighterState { health:number; focus:number; guardPercent:number; rounds:number; lastKind:GlyphAttackKind|null }
interface PendingAttack { readonly obstacleId:string; readonly symbol:string; readonly attackerId:string; readonly targetId:string; readonly at:number }
export type GlyphTurnPhase = "PLANNING" | "WAITING" | "REVEAL" | "FINISHED";
export interface GlyphDuelFighterView { readonly playerId:string; readonly health:number; readonly focus:number; readonly guardPercent:number; readonly rounds:number }
export interface GlyphDuelMoveView { readonly symbol:string; readonly role:GlyphMoveRole; readonly roleLabel:string; readonly elementLabel:string; readonly label:string; readonly damage:number; readonly attackerId:string; readonly targetId:string; readonly effectiveness?:string }
export interface GlyphDuelView { readonly local:GlyphDuelFighterView; readonly opponent:GlyphDuelFighterView; readonly phase:GlyphTurnPhase; readonly turn:number; readonly turnEndsAt?:number; readonly prompt:string; readonly lastMove:GlyphDuelMoveView|null; readonly resolvedMoves?:readonly GlyphDuelMoveView[]; readonly callout:string; readonly calloutAt:number; readonly revision:number }
const fresh=():FighterState=>({health:100,focus:0,guardPercent:0,rounds:0,lastKind:null});

/** Deterministic prototype of the state that the replacement Match module must own. */
export class GlyphDuelModel {
  private readonly fighters=new Map<string,FighterState>();private readonly pending=new Map<string,PendingAttack>();private readonly processed=new Set<string>();
  private opponentId="OPPONENT";private phase:GlyphTurnPhase="PLANNING";private turn=1;private turnEndsAt:number|undefined;private prompt="기술을 비공개로 선택하세요";private lastMove:GlyphDuelMoveView|null=null;private resolvedMoves:GlyphDuelMoveView[]=[];private callout="ROUND 1 · 동시 선택";private calloutAt=0;private revision=0;private authoritativeSequence=-1;
  constructor(private readonly localPlayerId:string){this.fighter(localPlayerId);}
  ingest(event:LineRaceServerEvent):boolean{
    if(this.processed.has(event.eventId))return false;this.processed.add(event.eventId);
    if(event.type==="LINE_RACE_ATTACK_ACCEPTED"){
      this.opponentId=event.attackerPlayerId===this.localPlayerId?event.targetPlayerId:event.attackerPlayerId;this.fighter(event.attackerPlayerId);this.fighter(event.targetPlayerId);
      this.pending.set(event.obstacle.obstacleId,{obstacleId:event.obstacle.obstacleId,symbol:event.consumedSymbol,attackerId:event.attackerPlayerId,targetId:event.targetPlayerId,at:event.occurredAt});
      const localChoice=event.attackerPlayerId===this.localPlayerId;const rule=getGlyphCombatRule(event.consumedSymbol);this.phase=localChoice?"WAITING":"PLANNING";this.prompt=localChoice?"내 선택 잠금 · 상대 선택을 기다리는 중":"상대 선택 완료 · 기술 내용은 공개되지 않습니다";
      this.setCallout(localChoice?`${event.consumedSymbol} ${rule.roleLabel} 선택 완료`:"상대 선택 완료",event.occurredAt);return true;
    }
    if(event.type==="LINE_RACE_COUNTER_SUCCEEDED"){
      const attack=this.pending.get(event.obstacleId);if(!attack)return false;this.pending.delete(event.obstacleId);const defender=this.fighter(attack.targetId);defender.focus=Math.min(100,defender.focus+20);defender.guardPercent=Math.max(defender.guardPercent,25);
      this.phase="PLANNING";this.prompt="방어 성공 · 다음 턴 기술을 선택하세요";this.turn+=1;this.setCallout(`완벽 방어 · ${attack.symbol}`,event.occurredAt);return true;
    }
    if(event.type==="LINE_RACE_TRAVERSAL_STARTED"){
      const attack=this.pending.get(event.obstacleId);if(!attack)return false;this.pending.delete(event.obstacleId);this.resolveMove(attack,event.occurredAt);return true;
    }
    return false;
  }
  /** Applies a backend Match event without deriving HP, focus, guard or rounds on the client. */
  ingestGlyphTurn(event: GlyphTurnServerEvent): boolean {
    if (this.processed.has(event.eventId) || event.sequence <= this.authoritativeSequence) return false;
    this.processed.add(event.eventId); this.authoritativeSequence = event.sequence;
    if (event.type === "GLYPH_TURN_CHOICE_LOCKED") {
      this.opponentId = event.playerId === this.localPlayerId ? this.opponentId : event.playerId;
      const local = event.playerId === this.localPlayerId; this.turnEndsAt=event.turnEndsAt;this.phase = local ? "WAITING" : "PLANNING"; this.prompt = local ? "내 선택 잠금 · 상대 선택을 기다리는 중" : "상대 선택 완료 · 기술 내용은 공개되지 않습니다"; this.setCallout(local ? "선택 완료" : "상대 선택 완료", event.occurredAt); return true;
    }
    this.turn = event.turn;
    for (const fighter of event.fighters) { this.fighter(fighter.playerId); this.replaceFighter(fighter); if (fighter.playerId !== this.localPlayerId) this.opponentId = fighter.playerId; }
    if (event.type === "GLYPH_DUEL_SNAPSHOT") { this.phase = event.phase;this.turnEndsAt=event.turnEndsAt;if(event.phase==="PLANNING"){this.lastMove=null;this.resolvedMoves=[];} this.prompt = event.lockedPlayerIds.includes(this.localPlayerId) ? "내 선택 잠금 · 상대 선택을 기다리는 중" : "기술을 비공개로 선택하세요"; this.setCallout(`ROUND ${event.turn} · 서버 동기화`, event.occurredAt); return true; }
    this.phase = event.fighters.some((fighter) => fighter.health <= 0) ? "FINISHED" : "REVEAL";
    this.turnEndsAt=undefined;this.resolvedMoves=event.choices.map(choice=>{const rule=getGlyphCombatRule(choice.symbol);return{symbol:choice.symbol,role:choice.role,roleLabel:rule.roleLabel,elementLabel:rule.elementLabel,label:rule.label,damage:choice.damage,attackerId:choice.playerId,targetId:choice.playerId===this.localPlayerId?this.opponentId:this.localPlayerId,effectiveness:choice.effectiveness};});this.lastMove=this.resolvedMoves.find(move=>move.attackerId===this.localPlayerId)??this.resolvedMoves[0]??null;
    this.prompt = this.phase === "FINISHED" ? "경기 종료" : "양쪽 기술 공개"; this.setCallout(this.lastMove?`${this.lastMove.symbol} ${this.lastMove.label} · ${this.lastMove.damage} 피해`:"양쪽 기술 공개", event.occurredAt); return true;
  }
  getView():GlyphDuelView{return{local:this.view(this.localPlayerId),opponent:this.view(this.opponentId),phase:this.phase,turn:this.turn,turnEndsAt:this.turnEndsAt,prompt:this.prompt,lastMove:this.lastMove,resolvedMoves:[...this.resolvedMoves],callout:this.callout,calloutAt:this.calloutAt,revision:this.revision};}
  private resolveMove(attack:PendingAttack,at:number):void{
    const rule=getGlyphCombatRule(attack.symbol),attacker=this.fighter(attack.attackerId),defender=this.fighter(attack.targetId),affinity=elementalModifier(rule.kind,defender.lastKind);let power=rule.damage;
    if(rule.focusCost>0){if(attacker.focus>=rule.focusCost)attacker.focus-=rule.focusCost;else power=Math.ceil(power*.45);}
    const raw=Math.max(1,Math.round(power*affinity.multiplier)),reduced=Math.round(raw*defender.guardPercent/100),damage=Math.max(0,raw-reduced);defender.guardPercent=0;defender.health=Math.max(0,defender.health-damage);attacker.focus=Math.min(100,attacker.focus+rule.focusGain);defender.focus=Math.max(0,defender.focus-rule.focusDrain);attacker.guardPercent=Math.max(attacker.guardPercent,rule.damageReduction);attacker.lastKind=rule.kind;
    this.lastMove={symbol:attack.symbol,role:rule.role,roleLabel:rule.roleLabel,elementLabel:rule.elementLabel,label:rule.label,damage,attackerId:attack.attackerId,targetId:attack.targetId,effectiveness:affinity.label};
    const guardText=reduced?` · 방어 ${reduced} 감소`:"",weakFinisher=rule.focusCost>0&&power<rule.damage?" · 집중 부족":"";this.setCallout(`${attack.symbol} ${rule.label} · ${damage} 피해${guardText}${weakFinisher}${affinity.label?` · ${affinity.label}`:""}`,at);
    if(defender.health===0){this.finishRound(attack.attackerId,at);return;}
    this.turn+=1;this.phase="PLANNING";this.prompt="다음 턴 · 기술을 비공개로 선택하세요";
  }
  private finishRound(winnerId:string,at:number):void{const winner=this.fighter(winnerId);winner.rounds+=1;if(winner.rounds>=2){this.phase="FINISHED";this.prompt=winnerId===this.localPlayerId?"승리":"패배";this.setCallout(winnerId===this.localPlayerId?"BATTLE WIN":"BATTLE LOSE",at);return;}this.turn+=1;this.phase="PLANNING";this.prompt="새 라운드 · 동시에 기술을 선택하세요";this.setCallout(`ROUND ${winner.rounds+1}`,at);for(const fighter of this.fighters.values()){fighter.health=100;fighter.focus=Math.min(50,fighter.focus);fighter.guardPercent=0;fighter.lastKind=null;}this.pending.clear();}
  private fighter(id:string):FighterState{let value=this.fighters.get(id);if(!value){value=fresh();this.fighters.set(id,value);}return value;}
  private replaceFighter(source:{readonly playerId:string;readonly health:number;readonly focus:number;readonly guardPercent:number;readonly rounds:number}):void{const target=this.fighter(source.playerId);target.health=source.health;target.focus=source.focus;target.guardPercent=source.guardPercent;target.rounds=source.rounds;}
  private view(id:string):GlyphDuelFighterView{const value=this.fighter(id);return{playerId:id,health:value.health,focus:value.focus,guardPercent:value.guardPercent,rounds:value.rounds};}
  private setCallout(value:string,at:number):void{this.callout=value;this.calloutAt=at;this.revision+=1;}
}
