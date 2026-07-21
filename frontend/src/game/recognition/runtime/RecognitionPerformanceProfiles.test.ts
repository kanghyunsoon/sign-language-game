import {describe,expect,it} from "vitest";
import {RECOGNITION_PERFORMANCE_PROFILES} from "./RecognitionPerformanceProfiles";

describe("recognition performance profiles",()=>{
  it("keeps the documented HIGH, BALANCED and LOW_POWER limits",()=>{
    expect(RECOGNITION_PERFORMANCE_PROFILES.HIGH.rates).toEqual({renderFps:60,handTrackingFps:30,poseTrackingFps:12,aiInferenceFps:15});
    expect(RECOGNITION_PERFORMANCE_PROFILES.BALANCED.handDetection.maximumDetectedHands).toBe(4);
    expect(RECOGNITION_PERFORMANCE_PROFILES.LOW_POWER.maximumTrackedPeople).toBe(2);
    expect(RECOGNITION_PERFORMANCE_PROFILES.LOW_POWER.handDetection.maximumDetectedHands).toBe(2);
  });
});
