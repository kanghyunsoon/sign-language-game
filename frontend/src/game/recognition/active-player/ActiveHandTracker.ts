import type { ActivePlayerSnapshot } from "./activePlayerTypes";
import { HandOwnerResolver } from "./HandOwnerResolver";
import { DEFAULT_HAND_OWNERSHIP_CONFIG, type ActiveHandSession, type ActiveHandSnapshot, type ActiveHandTrack, type HandCandidate, type HandOwnershipConfig } from "./handOwnershipTypes";
export class ActiveHandTracker{
 private track:ActiveHandTrack|undefined;private session:ActiveHandSession|undefined;private lastSnapshot:ActiveHandSnapshot={scores:[],inputAllowed:false,detectedHandCount:0,reason:"NO_ACTIVE_PLAYER"};private readonly listeners=new Set<(snapshot:ActiveHandSnapshot)=>void>();
 constructor(private readonly resolver=new HandOwnerResolver(),private readonly config:HandOwnershipConfig=DEFAULT_HAND_OWNERSHIP_CONFIG,private readonly createId:()=>string=defaultId){}
 update(candidates:readonly HandCandidate[],player:ActivePlayerSnapshot,now:number):ActiveHandSnapshot{
  if(player.state!=="LOCKED"||!player.activeTrackId){this.invalidate();return this.publish({scores:[],inputAllowed:false,detectedHandCount:candidates.length,reason:"NO_ACTIVE_PLAYER"});}
  if(this.track&&this.track.ownerTrackId!==player.activeTrackId)this.invalidate();const resolution=this.resolver.resolve(candidates,player,this.track);
  if(!resolution.inputAllowed||!resolution.selected){if(this.track){const missed=this.track.missedFrames+1;if(missed>this.config.maximumMissedFrames||now-this.track.lastSeenAt>this.config.temporaryLostGraceMs)this.invalidate();else this.track={...this.track,missedFrames:missed};}return this.publish({...resolution,detectedHandCount:candidates.length,activeTrack:this.track,session:this.session});}
  const selected=resolution.selected,score=resolution.scores.find((item)=>item.handDetectionId===selected.detectionId)!.totalScore,needsSession=!this.track||!this.session,handId=needsSession?this.createId():this.track!.handId,stableHandedness=needsSession?selected.handedness:this.track!.handedness;
  this.track={handId,ownerTrackId:player.activeTrackId,handedness:stableHandedness,landmarks:selected.landmarks.map((point)=>({...point})),lastSeenAt:now,missedFrames:0,ownershipConfidence:score};if(needsSession)this.session={sessionId:this.createId(),activePlayerTrackId:player.activeTrackId,activeHandId:handId,startedAt:now};
  return this.publish({...resolution,detectedHandCount:candidates.length,activeTrack:this.track,session:this.session});
 }
 getSnapshot():ActiveHandSnapshot{return this.lastSnapshot;}subscribe(listener:(snapshot:ActiveHandSnapshot)=>void):()=>void{this.listeners.add(listener);listener(this.lastSnapshot);return()=>this.listeners.delete(listener);}reset():void{this.invalidate();this.publish({scores:[],inputAllowed:false,detectedHandCount:0,reason:"NO_ACTIVE_PLAYER"});}dispose():void{this.invalidate();this.resolver.dispose();this.listeners.clear();}
 private invalidate():void{this.track=undefined;this.session=undefined;}private publish(snapshot:ActiveHandSnapshot):ActiveHandSnapshot{this.lastSnapshot=snapshot;this.listeners.forEach((listener)=>listener(snapshot));return snapshot;}
}
function defaultId():string{return globalThis.crypto?.randomUUID?.()??`hand-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
