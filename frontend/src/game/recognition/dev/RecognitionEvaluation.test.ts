import {describe,expect,it} from "vitest";
import {RecognitionEvaluationCollector} from "./RecognitionEvaluation";
import type {GameRecognitionSnapshot} from "../session";

const performance={cameraFps:30,renderFps:60,handTrackingFps:24,poseTrackingFps:10,aiRequestFps:12,aiResponseFps:12,aiAverageLatencyMs:80,aiP95LatencyMs:120,handAverageLatencyMs:20,handP95LatencyMs:30,droppedHandFrames:1,droppedPoseFrames:2,droppedInferenceFrames:3,staleResponsesIgnored:4,mainThreadLongTaskCount:0,latestUpdatedAt:1};
function snapshot(state:GameRecognitionSnapshot["activePlayerState"]="LOCKED"):GameRecognitionSnapshot{return{connectionState:"READY",activePlayerState:state,detectedPoseCount:1,registrationProgress:1,decoderState:"TRACKING",inputAllowed:true,safetyMode:"ACTIVE_PLAYER_REQUIRED",performance};}

describe("RecognitionEvaluationCollector",()=>{
  it("scores ordered confirmations, misses, false transitions and duplicates",()=>{let now=100;const collector=new RecognitionEvaluationCollector(()=>now);collector.start("CONTINUOUS_SIGNS",["ㄱ","ㄴ"]);collector.accept({type:"SIGN_CONFIRMED",symbol:"ㄴ",confidence:.9,occurredAt:now},snapshot(),90);collector.accept({type:"SIGN_CONFIRMED",symbol:"ㄴ",confidence:.9,occurredAt:++now},snapshot(),110);const result=collector.stop();expect(result.transitionFalsePositiveCount).toBe(1);expect(result.duplicateConfirmationCount).toBe(1);expect(result.confirmedSignCount).toBe(0);expect(result.missedSignCount).toBe(2);});
  it("tracks lost and reacquired states and aggregates performance",()=>{let now=100;const collector=new RecognitionEvaluationCollector(()=>now);collector.start("OCCLUSION",[]);collector.sample(snapshot("LOCKED"),0);collector.sample(snapshot("TEMPORARILY_LOST"),0);collector.sample(snapshot("LOCKED"),1);now=500;const result=collector.stop();expect(result.activePlayerLostCount).toBe(1);expect(result.activePlayerReacquiredCount).toBe(1);expect(result.cameraFpsAverage).toBe(30);expect(result.droppedFrames).toBe(6);});
});
