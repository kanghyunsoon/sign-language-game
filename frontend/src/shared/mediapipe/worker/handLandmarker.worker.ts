import {HandLandmarker,type HandLandmarkerResult} from "@mediapipe/tasks-vision";
import type{HandDetectionConfig}from"../types";
import{createVisionFileset}from"../createVisionFileset";
type Message={type:"INITIALIZE";config:HandDetectionConfig}|{type:"DETECT";frameId:number;timestamp:number;bitmap:ImageBitmap}|{type:"CLOSE"};
const scope=self as unknown as {onmessage:((event:MessageEvent<Message>)=>void)|null;postMessage:(message:unknown)=>void};let landmarker:HandLandmarker|null=null;
scope.onmessage=(event)=>{void handle(event.data).catch((cause)=>scope.postMessage({type:"ERROR",message:cause instanceof Error?cause.message:String(cause)}));};
async function handle(message:Message){if(message.type==="INITIALIZE"){const vision=await createVisionFileset(true);try{landmarker=await create(vision,"GPU",message.config);}catch{landmarker=await create(vision,"CPU",message.config);}warmUp(landmarker);scope.postMessage({type:"READY"});return;}if(message.type==="CLOSE"){landmarker?.close();landmarker=null;return;}if(!landmarker)throw new Error("Hand Landmarker worker is not initialized.");try{const result=landmarker.detectForVideo(message.bitmap,message.timestamp);scope.postMessage({type:"RESULT",frameId:message.frameId,hands:convert(result)});}finally{message.bitmap.close();}}
function create(vision:Awaited<ReturnType<typeof createVisionFileset>>,delegate:"GPU"|"CPU",config:HandDetectionConfig){return HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:"/mediapipe/hand_landmarker.task",delegate},runningMode:"VIDEO",numHands:config.maximumDetectedHands,minHandDetectionConfidence:config.minimumHandDetectionConfidence,minHandPresenceConfidence:config.minimumHandPresenceConfidence,minTrackingConfidence:config.minimumTrackingConfidence});}
/**
 * GPU 딜리게이트의 첫 추론들은 셰이더 컴파일을 수반해 프레임당 수백 ms씩
 * 걸린다. READY 전에 미리 돌려서 그 비용을 "카메라 준비 중" 단계에서
 * 소진한다. 빈 프레임은 손바닥 검출 경로만 데우고 손 랜드마크 서브그래프는
 * 첫 실제 손에서 컴파일되므로(시작 직후 렉의 잔여 원인), 손바닥과 다섯
 * 손가락을 그린 합성 손으로 검출을 실제로 발화시켜 전체 그래프를 데운다.
 * 합성 손이 검출되지 않는 환경이어도 손바닥 검출 경로 워밍업은 그대로
 * 이뤄진다. 타임스탬프: 워커의 performance.now()는 워커 생성 시점 기준이라
 * 메인 스레드가 보내는 값(페이지 로드 기준)보다 항상 작아 단조 증가가
 * 깨지지 않는다. 워밍업 실패는 무시한다 — 초기화를 막는 것이 더 나쁘다.
 */
function warmUp(instance:HandLandmarker){try{const size=256;const canvas=new OffscreenCanvas(size,size);const context=canvas.getContext("2d");if(!context)return;const base=performance.now();for(let i=0;i<4;i+=1){drawSyntheticHand(context,size);const bitmap=canvas.transferToImageBitmap();try{instance.detectForVideo(bitmap,base+i);}finally{bitmap.close();}}}catch{/* 워밍업은 최적화일 뿐, 실패해도 진행한다. */}}
function drawSyntheticHand(context:OffscreenCanvasRenderingContext2D,size:number){context.fillStyle="#3a3a3a";context.fillRect(0,0,size,size);context.fillStyle="#e0b39a";const cx=size/2,palmTop=size*0.45,palmW=size*0.34,palmH=size*0.32;
// 손바닥
context.beginPath();context.roundRect(cx-palmW/2,palmTop,palmW,palmH,size*0.06);context.fill();
// 네 손가락 (위로)
const fw=palmW/5.2;for(let f=0;f<4;f+=1){const fx=cx-palmW/2+palmW*(0.08+f*0.24);context.beginPath();context.roundRect(fx,palmTop-size*0.26,fw,size*0.28,fw/2);context.fill();}
// 엄지 (왼쪽 비스듬히)
context.save();context.translate(cx-palmW/2,palmTop+palmH*0.35);context.rotate(-0.7);context.beginPath();context.roundRect(-size*0.2,0,size*0.2,fw*1.1,fw/2);context.fill();context.restore();
// 살짝 음영을 넣어 검출기가 윤곽을 잡기 쉽게 한다.
context.fillStyle="rgba(0,0,0,0.12)";context.beginPath();context.roundRect(cx-palmW/2+palmW*0.1,palmTop+palmH*0.55,palmW*0.8,palmH*0.3,size*0.04);context.fill();}
function convert(result:HandLandmarkerResult){return result.landmarks.map((landmarks,index)=>({handedness:handedness(result.handedness[index]?.[0]?.categoryName),handednessScore:result.handedness[index]?.[0]?.score??0,landmarks:landmarks.map(({x,y,z})=>({x,y,z}))}));}
function handedness(value:string|undefined){const normalized=value?.toUpperCase();return normalized==="LEFT"||normalized==="RIGHT"?normalized:"UNKNOWN";}
export {};
