import { describe, expect, it } from "vitest";
import { HandOwnerResolver } from "./HandOwnerResolver";
import type { ActivePlayerSnapshot, PersonTrack } from "./activePlayerTypes";
import type { ActiveHandTrack, HandCandidate, HandOwnershipConfig } from "./handOwnershipTypes";
import { DEFAULT_HAND_OWNERSHIP_CONFIG } from "./handOwnershipTypes";

describe("HandOwnerResolver",()=>{
  it("selects the active player's wrist rather than a surrounding person's hand",()=>{const result=resolver().resolve([hand("mine","LEFT",.3,.3),hand("other","RIGHT",.9,.2)],snapshot());expect(result.inputAllowed).toBe(true);expect(result.selected?.detectionId).toBe("mine");});
  it("matches the nearest pose wrist even when selfie handedness is mirrored",()=>{const result=resolver().resolve([hand("mine","RIGHT",.3,.3)],snapshot());expect(result.inputAllowed).toBe(true);expect(result.selected?.detectionId).toBe("mine");});
  it("blocks similar ownership candidates as ambiguous",()=>{const config={...DEFAULT_HAND_OWNERSHIP_CONFIG,minimumScoreGap:.2};const result=new HandOwnerResolver(config).resolve([hand("one","LEFT",.3,.3),hand("two","LEFT",.31,.3)],snapshot());expect(result.inputAllowed).toBe(false);expect(result.reason).toBe("AMBIGUOUS");});
  it("blocks input without a locked active player",()=>{const result=resolver().resolve([hand("one","LEFT",.3,.3)],snapshot("TEMPORARILY_LOST"));expect(result.reason).toBe("NO_ACTIVE_PLAYER");});
  it("allows the sole hand of the sole registered player even when a pose anchor briefly disappears",()=>{const state=snapshot();const track={...state.tracks[0]!,poseLandmarks:[]} as PersonTrack;const result=resolver().resolve([hand("one","LEFT",.3,.3)],{...state,tracks:[track]});expect(result.inputAllowed).toBe(true);expect(result.selected?.detectionId).toBe("one");});
  it("blocks missing pose wrists when multiple people are present",()=>{const state=snapshot();const track={...state.tracks[0]!,poseLandmarks:[]} as PersonTrack;const result=resolver().resolve([hand("one","LEFT",.3,.3)],{...state,detectedPoseCount:2,tracks:[track]});expect(result.reason).toBe("POSE_ANCHOR_UNAVAILABLE");});
  it("does not drop the sole registered user's fast hand movement",()=>{const previous:ActiveHandTrack={handId:"h",ownerTrackId:"player",handedness:"LEFT",landmarks:points(.3,.3),lastSeenAt:0,missedFrames:0,ownershipConfidence:1};const result=resolver().resolve([hand("jump","LEFT",.8,.8)],snapshot(),previous);expect(result.inputAllowed).toBe(true);expect(result.selected?.detectionId).toBe("jump");});
  it("reweights remaining evidence when segmentation is unavailable",()=>{const result=resolver().resolve([hand("mine","LEFT",.3,.3)],snapshot());expect(result.scores[0]?.segmentationScore).toBeUndefined();expect(result.scores[0]!.totalScore).toBeGreaterThan(.75);});
});

function resolver(config?:HandOwnershipConfig){return new HandOwnerResolver(config);}
function hand(id:string,handedness:"LEFT"|"RIGHT",x:number,y:number):HandCandidate{return{detectionId:id,handedness,handednessScore:.98,wrist:{x,y,z:0},landmarks:points(x,y),detectedAt:100};}
function points(x:number,y:number){return Array.from({length:21},(_,index)=>({x:x-(index===9?.08:0),y:y-(index===9?.08:0),z:0}));}
function snapshot(state:ActivePlayerSnapshot["state"]="LOCKED"):ActivePlayerSnapshot{return{state,activeTrackId:"player",tracks:[track()],scores:[],detectedPoseCount:1,lostDurationMs:0,idSwitchCount:0,registrationProgress:1};}
function track():PersonTrack{const pose=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1}));pose[11]={x:.4,y:.4,z:0,visibility:1};pose[12]={x:.6,y:.4,z:0,visibility:1};pose[13]={x:.4,y:.4,z:0,visibility:1};pose[15]={x:.3,y:.3,z:0,visibility:1};pose[14]={x:.6,y:.4,z:0,visibility:1};pose[16]={x:.7,y:.3,z:0,visibility:1};return{trackId:"player",boundingBox:{x:.15,y:.1,width:.7,height:.85},predictedBoundingBox:{x:.15,y:.1,width:.7,height:.85},poseLandmarks:pose,poseFeatures:new Float32Array([1]),velocity:{x:0,y:0},createdAt:0,lastSeenAt:100,missedFrames:0,state:"ACTIVE"};}
