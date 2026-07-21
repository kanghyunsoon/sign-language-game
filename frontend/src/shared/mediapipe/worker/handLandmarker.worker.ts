import {HandLandmarker,type HandLandmarkerResult} from "@mediapipe/tasks-vision";
import type{HandDetectionConfig}from"../types";
import{createVisionFileset}from"../createVisionFileset";
type Message={type:"INITIALIZE";config:HandDetectionConfig}|{type:"DETECT";frameId:number;timestamp:number;bitmap:ImageBitmap}|{type:"CLOSE"};
const scope=self as unknown as {onmessage:((event:MessageEvent<Message>)=>void)|null;postMessage:(message:unknown)=>void};let landmarker:HandLandmarker|null=null;
scope.onmessage=(event)=>{void handle(event.data).catch((cause)=>scope.postMessage({type:"ERROR",message:cause instanceof Error?cause.message:String(cause)}));};
async function handle(message:Message){if(message.type==="INITIALIZE"){const vision=await createVisionFileset(true);try{landmarker=await create(vision,"GPU",message.config);}catch{landmarker=await create(vision,"CPU",message.config);}scope.postMessage({type:"READY"});return;}if(message.type==="CLOSE"){landmarker?.close();landmarker=null;return;}if(!landmarker)throw new Error("Hand Landmarker worker is not initialized.");try{const result=landmarker.detectForVideo(message.bitmap,message.timestamp);scope.postMessage({type:"RESULT",frameId:message.frameId,hands:convert(result)});}finally{message.bitmap.close();}}
function create(vision:Awaited<ReturnType<typeof createVisionFileset>>,delegate:"GPU"|"CPU",config:HandDetectionConfig){return HandLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:"/mediapipe/hand_landmarker.task",delegate},runningMode:"VIDEO",numHands:config.maximumDetectedHands,minHandDetectionConfidence:config.minimumHandDetectionConfidence,minHandPresenceConfidence:config.minimumHandPresenceConfidence,minTrackingConfidence:config.minimumTrackingConfidence});}
function convert(result:HandLandmarkerResult){return result.landmarks.map((landmarks,index)=>({handedness:handedness(result.handedness[index]?.[0]?.categoryName),handednessScore:result.handedness[index]?.[0]?.score??0,landmarks:landmarks.map(({x,y,z})=>({x,y,z}))}));}
function handedness(value:string|undefined){const normalized=value?.toUpperCase();return normalized==="LEFT"||normalized==="RIGHT"?normalized:"UNKNOWN";}
export {};
