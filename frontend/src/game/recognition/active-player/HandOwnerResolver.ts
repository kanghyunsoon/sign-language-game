import { clamp01, weightedOwnershipScore } from "./HandOwnershipScore";
import { NoOpPlayerSegmentationAdapter, type PlayerSegmentationAdapter } from "./PlayerSegmentationAdapter";
import type { ActivePlayerSnapshot, PersonTrack } from "./activePlayerTypes";
import { DEFAULT_HAND_OWNERSHIP_CONFIG, extractArmAnchors, type ActiveHandTrack, type HandCandidate, type HandOwnerResolution, type HandOwnershipConfig, type HandOwnershipScore, type Point3D } from "./handOwnershipTypes";

export class HandOwnerResolver {
  constructor(private readonly config:HandOwnershipConfig=DEFAULT_HAND_OWNERSHIP_CONFIG,private readonly segmentation:PlayerSegmentationAdapter=new NoOpPlayerSegmentationAdapter()){}
  resolve(candidates:readonly HandCandidate[],player:ActivePlayerSnapshot,previous?:ActiveHandTrack):HandOwnerResolution{
    if(player.state!=="LOCKED"||!player.activeTrackId)return{scores:[],inputAllowed:false,reason:"NO_ACTIVE_PLAYER"};
    const track=player.tracks.find((item)=>item.trackId===player.activeTrackId&&item.state==="ACTIVE");
    if(!track)return{scores:[],inputAllowed:false,reason:"NO_ACTIVE_PLAYER"};
    if(!candidates.length)return{scores:[],inputAllowed:false,reason:previous?"TEMPORARILY_LOST":"NO_HAND"};
    // Normal gameplay registers one person and detects one hand. In that
    // situation there is no competing owner, so strict multi-person scoring
    // only causes valid frames to flicker in and out as Pose runs at a lower
    // rate than Hand Landmarker. Crowd mode still uses the full resolver.
    if(player.detectedPoseCount<=1&&candidates.length===1){const selected=candidates[0]!,score=this.score(selected,track,previous);return{selected,scores:[score],inputAllowed:true};}
    const anchors=extractArmAnchors(track);if(!anchors.leftWrist&&!anchors.rightWrist)return{scores:[],inputAllowed:false,reason:"POSE_ANCHOR_UNAVAILABLE"};
    const scores=candidates.map((candidate)=>this.score(candidate,track,previous)).sort((a,b)=>b.totalScore-a.totalScore),best=scores[0]!;
    const selected=candidates.find((candidate)=>candidate.detectionId===best.handDetectionId)!;
    if(previous&&normalizedDistance(previous.landmarks[0],selected.wrist,shoulderWidth(track))>this.config.maximumNormalizedHandJump)return{scores,inputAllowed:false,reason:"SUDDEN_JUMP"};
    const singleRegisteredUser = player.detectedPoseCount === 1 && candidates.length === 1;
    const minimumScore = singleRegisteredUser
      ? Math.min(this.config.minimumOwnershipScore, .5)
      : this.config.minimumOwnershipScore;
    if(best.totalScore<minimumScore)return{scores,inputAllowed:false,reason:"LOW_CONFIDENCE"};
    if(scores[1]&&best.totalScore-scores[1].totalScore<this.config.minimumScoreGap)return{scores,inputAllowed:false,reason:"AMBIGUOUS"};
    return{selected,scores,inputAllowed:true};
  }
  dispose():void{this.segmentation.dispose();}
  private score(candidate:HandCandidate,track:PersonTrack,previous?:ActiveHandTrack):HandOwnershipScore{
    const anchors=extractArmAnchors(track),wrist=nearest(candidate.wrist,anchors.leftWrist,anchors.rightWrist);
    const side=wrist===anchors.leftWrist?"left":wrist===anchors.rightWrist?"right":undefined;
    const elbow=side==="left"?anchors.leftElbow:side==="right"?anchors.rightElbow:nearest(wrist,anchors.leftElbow,anchors.rightElbow),scale=shoulderWidth(track);
    const poseWristDistanceScore=wrist?Math.exp(-normalizedDistance(candidate.wrist,wrist,scale)*1.8):0;
    const armDirectionScore=wrist&&elbow?directionScore(subtract(wrist,elbow),subtract(candidate.landmarks[9]??candidate.wrist,candidate.wrist)):0;
    const temporalContinuityScore=previous?Math.exp(-normalizedDistance(candidate.wrist,previous.landmarks[0],scale)*1.6):.7;
    // The preview is mirrored with CSS but MediaPipe analyzes the unmirrored
    // frame. Spatial wrist proximity is authoritative; handedness is only a
    // supporting signal so a mirrored label cannot select the opposite arm.
    const handednessScore=candidate.handedness==="UNKNOWN"?.5:side&&wrist?Math.max(.5,candidate.handednessScore):.5;
    const segmentationScore=averageMembership(this.segmentation,candidate),activePlayerBoundsScore=boundsScore(candidate.wrist,track);
    const values={poseWristDistanceScore,armDirectionScore,temporalContinuityScore,handednessScore,segmentationScore,activePlayerBoundsScore};
    return{handDetectionId:candidate.detectionId,activePlayerTrackId:track.trackId,...values,totalScore:weightedOwnershipScore(values,this.config.weights)};
  }
}
function shoulderWidth(track:PersonTrack):number{const left=track.poseLandmarks[11],right=track.poseLandmarks[12];return left&&right?Math.max(.03,distance(left,right)):Math.max(.03,track.boundingBox.width*.35);}
function normalizedDistance(a:Point3D|undefined,b:Point3D|undefined,scale:number):number{return a&&b?distance(a,b)/scale:Number.POSITIVE_INFINITY;}
function distance(a:Point3D,b:Point3D):number{return Math.hypot(a.x-b.x,a.y-b.y,(a.z-b.z)*.3);}
function subtract(a:Point3D,b:Point3D):Point3D{return{x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};}
function directionScore(a:Point3D,b:Point3D):number{const length=Math.hypot(a.x,a.y,a.z)*Math.hypot(b.x,b.y,b.z);return length?clamp01((a.x*b.x+a.y*b.y+a.z*b.z)/length*.5+.5):.5;}
function nearest(origin:Point3D|undefined,first?:Point3D,second?:Point3D):Point3D|undefined{if(!origin)return first??second;if(!first)return second;if(!second)return first;return distance(origin,first)<=distance(origin,second)?first:second;}
function boundsScore(point:Point3D,track:PersonTrack):number{const box=track.boundingBox,margin=Math.max(box.width,box.height)*.2,dx=Math.max(box.x-margin-point.x,0,point.x-(box.x+box.width+margin)),dy=Math.max(box.y-margin-point.y,0,point.y-(box.y+box.height+margin));return Math.exp(-Math.hypot(dx,dy)/Math.max(.03,box.width)*3);}
function averageMembership(adapter:PlayerSegmentationAdapter,hand:HandCandidate):number|undefined{const values=hand.landmarks.map((point)=>adapter.getPointMembership(point.x,point.y)).filter((value):value is number=>value!==undefined);return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:undefined;}
