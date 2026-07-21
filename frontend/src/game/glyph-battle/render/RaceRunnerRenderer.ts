import { Assets, Container, Graphics, Sprite } from "pixi.js";
import type { GlyphMoveRole } from "../duel/GlyphCombatRules";

const PLAYER_OTTER_URL = new URL("../assets/turn-otter-player.png", import.meta.url).href;
const RIVAL_OTTER_URL = new URL("../assets/turn-otter-rival.png", import.meta.url).href;

export type RunnerBattleMotion = "IDLE" | "LOCKED" | "HIT" | GlyphMoveRole;

export interface RunnerMotionCue {
  readonly motion: RunnerBattleMotion;
  readonly ageMs: number;
}

export async function preloadRaceRunnerAsset(): Promise<void> {
  await Promise.all([Assets.load(PLAYER_OTTER_URL), Assets.load(RIVAL_OTTER_URL)]);
}

export class RaceRunnerRenderer {
  readonly root = new Container();
  private readonly shadow = new Graphics();
  private readonly motion = new Graphics();
  private readonly fighter: Sprite;
  private readonly isLocal: boolean;
  private viewportScale = 1;

  constructor(readonly playerId:string){
    this.isLocal = playerId === "PLAYER_A";
    this.fighter = Sprite.from(this.isLocal ? PLAYER_OTTER_URL : RIVAL_OTTER_URL);
    this.fighter.anchor.set(.5, 1);
    const targetHeight = this.isLocal ? 184 : 148;
    // Pixi's real Sprite always has a texture; the fallback keeps lightweight
    // renderer test doubles compatible without weakening runtime loading.
    const sourceHeight = this.fighter.texture?.height || 1254;
    this.fighter.scale.set(targetHeight / sourceHeight);
    this.root.addChild(this.shadow, this.motion, this.fighter);
  }

  setViewportScale(scale:number):void{this.viewportScale=Math.max(.65,Math.min(1,scale));}

  render(x:number,y:number,now:number,_moving:boolean,rotation=0,colliding=false,cue:RunnerMotionCue={motion:"IDLE",ageMs:0}):void{
    const ink=0x171717;
    const breath=Math.sin(now/260);
    const secondBreath=Math.sin(now/520+.8);
    const age=Math.max(0,cue.ageMs);
    const action=Math.min(1,age/210);
    const recover=Math.max(0,1-Math.max(0,age-360)/470);
    let offsetX=secondBreath*1.2,offsetY=breath*2.2,rotationDelta=breath*.008,scaleX=1+breath*.008,scaleY=1-breath*.012;

    if(cue.motion==="LOCKED"){
      offsetY-=2+Math.sin(now/95)*2;scaleX*=1.025;scaleY*=.98;
    }else if(cue.motion==="ATTACK"){
      const direction=this.isLocal?1:-1;const windup=Math.sin(Math.min(1,age/150)*Math.PI);
      offsetX+=direction*(34*action*recover-10*windup);offsetY-=15*Math.sin(Math.PI*action)*recover;rotationDelta+=direction*.14*recover;scaleX*=1.1;scaleY*=.92;
    }else if(cue.motion==="FINISHER"){
      const direction=this.isLocal?1:-1;const charge=Math.min(1,age/180);
      offsetX+=direction*62*action*recover;offsetY-=22*Math.sin(Math.PI*action)*recover-4*Math.sin(age/28)*(1-charge);rotationDelta+=direction*.18*recover;scaleX*=1.14;scaleY*=.86;
    }else if(cue.motion==="GUARD"){
      offsetY+=11*action*recover;offsetX+=(this.isLocal?-1:1)*5*action;scaleX*=1.12;scaleY*=.86;rotationDelta+=(this.isLocal?-.055:.055)*recover;
    }else if(cue.motion==="FOCUS"){
      const gather=Math.min(1,age/360);offsetY+=7*gather-13*Math.sin(Math.PI*gather);scaleX*=1-.08*gather;scaleY*=1+.1*gather;rotationDelta+=Math.sin(age/34)*.018*(1-gather);
    }else if(cue.motion==="HIT"||colliding){
      const direction=this.isLocal?-1:1,impact=Math.sin(Math.PI*Math.min(1,age/180));offsetX+=direction*16*impact;offsetY-=4*impact;rotationDelta+=direction*.1*impact;scaleX*=1-.04*impact;scaleY*=1+.035*impact;
    }

    this.root.position.set(x+offsetX,y+offsetY);
    this.root.rotation=Math.max(-.18,Math.min(.18,rotation+rotationDelta));
    this.root.scale.set(scaleX*this.viewportScale,scaleY*this.viewportScale);
    this.shadow.clear().ellipse(0,7,this.isLocal?55:44,8).fill({color:0xf7f4ec,alpha:.7}).stroke({color:ink,width:2,alpha:.2});
    this.motion.clear();
    this.drawMotion(cue,now,recover);
  }

  private drawMotion(cue:RunnerMotionCue,now:number,fade:number):void{
    const ink=0x171717;const handX=this.isLocal?54:-48;const handY=this.isLocal?-118:-92;
    if(cue.motion==="LOCKED"){
      const pulse=5+(now/70)%13;for(let i=0;i<2;i+=1)this.motion.arc(handX,handY,pulse+i*9,-.9,.9).stroke({color:0x29d3e2,width:3-i,alpha:(.55-i*.16)});
    }else if(cue.motion==="FINISHER"){
      const side=this.isLocal?1:-1,p=Math.min(1,cue.ageMs/170),sweep=-1.2+p*2.35;
      this.motion.arc(side*35,-92,54,sweep-.62,sweep).stroke({color:0xffffff,width:9,alpha:.78*fade,cap:"round"});
      this.motion.arc(side*35,-92,61,sweep-.58,sweep).stroke({color:0xffb52e,width:4,alpha:.8*fade,cap:"round"});
    }else if(cue.motion==="GUARD"){
      const side=this.isLocal?1:-1;this.motion.arc(side*31,-77,57,-1.35,1.35).stroke({color:0xa96cff,width:8,alpha:.58*fade}).arc(side*31,-77,46,-1.32,1.32).stroke({color:ink,width:2,alpha:.45*fade});
    }else if(cue.motion==="FOCUS"){
      const gather=Math.min(1,cue.ageMs/430);for(let i=0;i<4;i+=1){const radius=66-i*12-gather*24+Math.sin(now/70+i)*3;this.motion.arc(0,-70,radius,now/260+i,now/260+i+1.7).stroke({color:i%2?0xffffff:0x29d3e2,width:6-i*.7,alpha:(.72-i*.1)*fade,cap:"round"});}
      this.motion.circle(0,-70,9+gather*16).fill({color:0x29d3e2,alpha:.2+.3*gather}).stroke({color:0xffffff,width:3,alpha:.8*fade});
    }else if(cue.motion==="HIT"){
      const hitFade=Math.max(0,1-cue.ageMs/180);if(hitFade>0){const side=this.isLocal?-1:1;this.motion.moveTo(side*28,-104).lineTo(side*53,-82).lineTo(side*27,-61).stroke({color:0xffffff,width:10,alpha:.8*hitFade,cap:"round",join:"round"}).stroke({color:0xff557a,width:5,alpha:.9*hitFade,cap:"round",join:"round"});}
    }
  }
}
