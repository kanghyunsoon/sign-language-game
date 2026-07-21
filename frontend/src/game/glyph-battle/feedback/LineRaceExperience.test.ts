import { describe, expect, it } from "vitest";
import type { LineRaceServerEvent } from "../contracts";
import { LineRaceFeedbackAudio } from "./LineRaceFeedbackAudio";
import { LineRacePlaytestTelemetry } from "./LineRacePlaytestTelemetry";
import { resolveLineRaceMotionMode } from "./LineRaceMotionPreference";

describe("line-race experience layer", () => {
  it("persists mute preference without creating audio before user interaction", () => {
    const values = new Map<string,string>();
    const storage = { getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>void values.set(key,value) };
    const first = new LineRaceFeedbackAudio(storage); expect(first.isMuted()).toBe(false);
    first.setMuted(true); const restored = new LineRaceFeedbackAudio(storage); expect(restored.isMuted()).toBe(true);
  });

  it("records only a privacy-safe event schema and computes monotonic phase latency", () => {
    let now = 10; const telemetry = new LineRacePlaytestTelemetry({ enabled:true, sessionId:"session", botDifficulty:"NORMAL", now:()=>now });
    telemetry.observeFeedback({ state:"RECOGNIZING", target:{kind:"ATTACK",symbols:["ㄱ"],available:true,cooldownRemainingMs:0}, symbol:"ㄱ", recognitionProgress:.4, message:"인식 중" });
    now=20; telemetry.ingestActionFeedback({type:"ATTACK_RECOGNIZED",commandId:"c1",symbol:"ㄱ",occurredAt:100});
    now=21; telemetry.ingestActionFeedback({type:"ATTACK_SENT",commandId:"c1",symbol:"ㄱ",occurredAt:101});
    now=40; telemetry.ingestActionFeedback({type:"ATTACK_SUCCEEDED",commandId:"c1",symbol:"ㄱ",obstacleId:"o1",occurredAt:120,sourceEventId:"e1"});
    now=42; telemetry.feedbackDisplayed({state:"SUCCESS",target:{kind:"ATTACK",symbols:["ㄱ"],available:true,cooldownRemainingMs:0},commandId:"c1",symbol:"ㄱ",effectKey:"success-1",message:"승인"});
    const summary=telemetry.toSummary(), serialized=JSON.stringify(summary.events);
    expect(summary.latenciesMs).toMatchObject({candidateToConfirmation:[10],confirmationToCommand:[1],commandToServerResult:[19],serverResultToFeedback:[2]});
    expect(summary.privacy).toEqual({videoFramesStored:false,imagesStored:false,landmarksStored:false,faceDataStored:false,rawWebSocketPayloadsStored:false});
    expect(serialized).not.toContain("landmarkCoordinates"); expect(serialized).not.toContain("videoFrame");
  });

  it("does not replay historical effects from a reconnect snapshot", () => {
    const telemetry=new LineRacePlaytestTelemetry({enabled:true,sessionId:"snapshot",now:()=>1});
    telemetry.ingestServerEvent(snapshotEvent(),"me");
    expect(telemetry.toSummary().events).toEqual([]);
  });

  it("defines a reduced-motion override for strong feedback animation", () => {
    expect(resolveLineRaceMotionMode({matches:true} as MediaQueryList)).toBe("REDUCED");
    expect(resolveLineRaceMotionMode({matches:false} as MediaQueryList)).toBe("FULL");
  });
});

function snapshotEvent():LineRaceServerEvent{return{type:"LINE_RACE_MATCH_SNAPSHOT",eventId:"snapshot-event",matchId:"match",sequence:10,occurredAt:1,
  snapshot:{matchId:"match",roomId:"room",status:"PLAYING",serverTime:1,sequence:10,myAttackHand:["ㄱ"],players:[],obstacles:[],config:{raceLength:1050,baseSpeedPerSecond:28,matchDurationMs:60000,countdownMs:3000,handSize:3,attackCooldownMs:700,counterWindowMs:2200,obstacleLeadDistance:160,minimumObstacleSpacing:60,maxPendingObstacles:4,reconnectGraceMs:10000,supportedSymbols:["ㄱ"]}}};}
