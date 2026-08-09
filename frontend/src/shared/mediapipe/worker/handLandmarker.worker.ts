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
 * 걸린다. READY 전에 빈 프레임으로 미리 돌려서 그 비용을 "카메라 준비 중"
 * 단계에서 소진한다. 빈 프레임에는 손이 없으므로 손 랜드마크 서브그래프는
 * 첫 실제 손에서 마저 컴파일되지만, 매 프레임 도는 손바닥 검출 경로가
 * 가장 크다. 타임스탬프: 워커의 performance.now()는 워커 생성 시점 기준이라
 * 메인 스레드가 보내는 값(페이지 로드 기준)보다 항상 작아 단조 증가가 깨지지
 * 않는다. 워밍업 실패는 무시한다 — 초기화를 막는 것이 더 나쁘다.
 */
function warmUp(instance:HandLandmarker){try{const canvas=new OffscreenCanvas(256,256);const context=canvas.getContext("2d");if(!context)return;const base=performance.now();for(let i=0;i<3;i+=1){context.fillStyle="#222";context.fillRect(0,0,256,256);const bitmap=canvas.transferToImageBitmap();try{instance.detectForVideo(bitmap,base+i);}finally{bitmap.close();}}}catch{/* 워밍업은 최적화일 뿐, 실패해도 진행한다. */}}
function convert(result:HandLandmarkerResult){return result.landmarks.map((landmarks,index)=>({handedness:handedness(result.handedness[index]?.[0]?.categoryName),handednessScore:result.handedness[index]?.[0]?.score??0,landmarks:landmarks.map(({x,y,z})=>({x,y,z}))}));}
function handedness(value:string|undefined){const normalized=value?.toUpperCase();return normalized==="LEFT"||normalized==="RIGHT"?normalized:"UNKNOWN";}
export {};
