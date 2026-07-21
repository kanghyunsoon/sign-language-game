import type { ActivePlayerConfig } from "./ActivePlayerConfig";
import { cosine } from "./PlayerAppearanceDescriptor";
import type { PersonMatchCost, PersonTrack, PoseDetection } from "./activePlayerTypes";
import type { PoseFeatureExtractor } from "./PoseFeatureExtractor";

export interface DetectionMatch { readonly trackIndex: number; readonly detectionIndex: number; readonly cost: PersonMatchCost; }
export class PersonDetectionMatcher {
  constructor(private readonly features: PoseFeatureExtractor, private readonly config: ActivePlayerConfig) {}
  match(tracks: readonly PersonTrack[], detections: readonly PoseDetection[], now: number): readonly DetectionMatch[] {
    const costs = tracks.map((track) => detections.map((detection) => this.cost(track, detection, now)));
    let best: { cost:number;matches:DetectionMatch[] }={cost:Number.POSITIVE_INFINITY,matches:[]};
    const search=(trackIndex:number,used:Set<number>,matches:DetectionMatch[],total:number)=>{
      if(trackIndex===tracks.length){if(total<best.cost)best={cost:total,matches:[...matches]};return;}
      search(trackIndex+1,used,matches,total+this.config.maximumMatchCost);
      for(let detectionIndex=0;detectionIndex<detections.length;detectionIndex+=1){if(used.has(detectionIndex))continue;const cost=costs[trackIndex]![detectionIndex]!;if(cost.totalCost>this.config.maximumMatchCost)continue;used.add(detectionIndex);matches.push({trackIndex,detectionIndex,cost});search(trackIndex+1,used,matches,total+cost.totalCost);matches.pop();used.delete(detectionIndex);}
    };
    search(0,new Set(),[],0);return best.matches;
  }
  cost(track:PersonTrack,detection:PoseDetection,now:number):PersonMatchCost{
    const expected=predict(track,now),centerA=center(expected),centerB=center(detection.boundingBox);
    const positionCost=clamp(Math.hypot(centerA.x-centerB.x,centerA.y-centerB.y)/Math.SQRT2);
    const boundingBoxCost=1-iou(expected,detection.boundingBox);
    const feature=this.features.extract(detection.poseLandmarks);const poseCost=1-cosine(track.poseFeatures,feature);
    const elapsed=Math.max(1,now-track.lastSeenAt);const observed={x:(centerB.x-center(track.boundingBox).x)/elapsed,y:(centerB.y-center(track.boundingBox).y)/elapsed};
    const motionCost=vectorCost(track.velocity,observed);
    const histogram=detection.torsoColorHistogram;const appearanceCost=histogram&&track.appearanceDescriptor?1-cosine(track.appearanceDescriptor.torsoColorHistogram,histogram):.5;
    const w=this.config.matchingWeights;return{positionCost,boundingBoxCost,poseCost,motionCost,appearanceCost,totalCost:positionCost*w.position+boundingBoxCost*w.boundingBox+poseCost*w.pose+motionCost*w.motion+appearanceCost*w.appearance};
  }
}
export function predict(track:PersonTrack,now:number){const dt=Math.max(0,now-track.lastSeenAt);return{...track.boundingBox,x:clamp(track.boundingBox.x+track.velocity.x*dt,0,1-track.boundingBox.width),y:clamp(track.boundingBox.y+track.velocity.y*dt,0,1-track.boundingBox.height)};}
function center(box:{x:number;y:number;width:number;height:number}){return{x:box.x+box.width/2,y:box.y+box.height/2};}
function iou(a:{x:number;y:number;width:number;height:number},b:{x:number;y:number;width:number;height:number}){const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),r=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height),intersection=Math.max(0,r-x)*Math.max(0,bottom-y),union=a.width*a.height+b.width*b.height-intersection;return union?intersection/union:0;}
function vectorCost(a:{x:number;y:number},b:{x:number;y:number}){const lengthA=Math.hypot(a.x,a.y),lengthB=Math.hypot(b.x,b.y);if(lengthA<1e-5&&lengthB<1e-5)return 0;if(lengthA<1e-5||lengthB<1e-5)return .5;return clamp((1-(a.x*b.x+a.y*b.y)/(lengthA*lengthB))/2);}
function clamp(value:number,min=0,max=1){return Math.max(min,Math.min(max,value));}
