import { describe, expect, it } from "vitest";
import { ActiveHandTracker } from "./ActiveHandTracker";
import type { HandOwnerResolver } from "./HandOwnerResolver";
import type { ActivePlayerSnapshot } from "./activePlayerTypes";
import type { HandCandidate, HandOwnerResolution } from "./handOwnershipTypes";

describe("ActiveHandTracker",()=>{
  it("keeps a stable hand and session id across detection array ids",()=>{const ids=sequenceIds(),tracker=new ActiveHandTracker(fakeResolver(),undefined,ids);const first=tracker.update([hand("d1","LEFT")],player(),100);const second=tracker.update([hand("d9","LEFT")],player(),120);expect(second.activeTrack?.handId).toBe(first.activeTrack?.handId);expect(second.session?.sessionId).toBe(first.session?.sessionId);});
  it("keeps the session when MediaPipe handedness flickers",()=>{const tracker=new ActiveHandTracker(fakeResolver(),undefined,sequenceIds());const first=tracker.update([hand("left","LEFT")],player(),100);const second=tracker.update([hand("right","RIGHT")],player(),120);expect(second.activeTrack?.handId).toBe(first.activeTrack?.handId);expect(second.session?.sessionId).toBe(first.session?.sessionId);expect(second.activeTrack?.handedness).toBe("LEFT");});
  it("retains a missing hand only during grace and blocks input",()=>{const tracker=new ActiveHandTracker(fakeResolver(),undefined,sequenceIds());tracker.update([hand("left","LEFT")],player(),100);const missing=tracker.update([],player(),200);expect(missing.inputAllowed).toBe(false);expect(missing.activeTrack).toBeDefined();const expired=tracker.update([],player(),1200);expect(expired.activeTrack).toBeUndefined();expect(expired.session).toBeUndefined();});
  it("invalidates ownership when active player is lost",()=>{const tracker=new ActiveHandTracker(fakeResolver(),undefined,sequenceIds());tracker.update([hand("left","LEFT")],player(),100);const lost=tracker.update([hand("left","LEFT")],player("TEMPORARILY_LOST"),120);expect(lost.inputAllowed).toBe(false);expect(lost.activeTrack).toBeUndefined();});
  it("cleans session and subscribers",()=>{const tracker=new ActiveHandTracker(fakeResolver(),undefined,sequenceIds());let calls=0;tracker.subscribe(()=>calls++);tracker.update([hand("left","LEFT")],player(),100);tracker.dispose();expect(calls).toBe(2);});
});
function fakeResolver(){return{resolve(candidates:readonly HandCandidate[],state:ActivePlayerSnapshot):HandOwnerResolution{if(state.state!=="LOCKED")return{scores:[],inputAllowed:false,reason:"NO_ACTIVE_PLAYER"};const selected=candidates[0];return selected?{selected,scores:[{handDetectionId:selected.detectionId,activePlayerTrackId:"player",poseWristDistanceScore:1,armDirectionScore:1,temporalContinuityScore:1,handednessScore:1,activePlayerBoundsScore:1,totalScore:.95}],inputAllowed:true}:{scores:[],inputAllowed:false,reason:"TEMPORARILY_LOST"};},dispose(){}} as unknown as HandOwnerResolver;}
function hand(id:string,handedness:"LEFT"|"RIGHT"):HandCandidate{return{detectionId:id,handedness,handednessScore:1,wrist:{x:.3,y:.3,z:0},landmarks:Array.from({length:21},()=>({x:.3,y:.3,z:0})),detectedAt:0};}
function player(state:ActivePlayerSnapshot["state"]="LOCKED"):ActivePlayerSnapshot{return{state,activeTrackId:"player",tracks:[],scores:[],detectedPoseCount:1,lostDurationMs:0,idSwitchCount:0,registrationProgress:1};}
function sequenceIds(){let value=0;return()=>`id-${++value}`;}
