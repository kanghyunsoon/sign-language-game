import type { TrackedHand } from "../MediaPipeHandTracker";
import { DEFAULT_HAND_DETECTION_CONFIG, type HandDetectionConfig } from "../types";
import { createVideoFrameBitmap } from "./createVideoFrameBitmap";

export interface WorkerLike { onmessage:((event:MessageEvent)=>void)|null;onerror:((event:ErrorEvent)=>void)|null;postMessage(message:unknown,transfer?:Transferable[]):void;terminate():void; }
interface Pending { resolve:(hands:readonly TrackedHand[])=>void;reject:(cause:unknown)=>void; }
export class HandLandmarkerWorkerClient {
  private worker:WorkerLike|null=null;private readonly pending=new Map<number,Pending>();private readyPromise:Promise<void>|null=null;private resolveReady:(()=>void)|null=null;private rejectReady:((cause:unknown)=>void)|null=null;
  constructor(private readonly createWorker:()=>WorkerLike=()=>new Worker(new URL("./handLandmarker.worker.ts",import.meta.url),{type:"module"}),private readonly config:HandDetectionConfig=DEFAULT_HAND_DETECTION_CONFIG){}
  initialize():Promise<void>{if(this.readyPromise)return this.readyPromise;const worker=this.createWorker();this.worker=worker;this.readyPromise=new Promise<void>((resolve,reject)=>{this.resolveReady=resolve;this.rejectReady=reject;});worker.onmessage=(event)=>this.receive(event.data);worker.onerror=(event)=>this.fail(new Error(event.message||"Hand worker failed."));worker.postMessage({type:"INITIALIZE",config:this.config});return this.readyPromise;}
  async detect(video:HTMLVideoElement,timestamp:number,frameId:number):Promise<readonly TrackedHand[]>{if(!this.worker||!this.readyPromise)throw new Error("Hand worker is not initialized.");await this.readyPromise;const bitmap=await createVideoFrameBitmap(video);return new Promise((resolve,reject)=>{this.pending.set(frameId,{resolve,reject});this.worker!.postMessage({type:"DETECT",frameId,timestamp,bitmap},[bitmap]);});}
  close():void{for(const item of this.pending.values())item.reject(new Error("Hand worker closed."));this.pending.clear();this.worker?.postMessage({type:"CLOSE"});this.worker?.terminate();this.worker=null;this.readyPromise=null;this.resolveReady=null;this.rejectReady=null;}
  private receive(value:unknown){if(!value||typeof value!=="object")return;const message=value as {type?:string;frameId?:number;hands?:readonly TrackedHand[];message?:string};if(message.type==="READY"){this.resolveReady?.();this.resolveReady=null;this.rejectReady=null;return;}if(message.type==="RESULT"&&typeof message.frameId==="number"){const pending=this.pending.get(message.frameId);this.pending.delete(message.frameId);pending?.resolve(message.hands??[]);return;}if(message.type==="ERROR")this.fail(new Error(message.message??"Hand worker failed."));}
  private fail(cause:unknown){this.rejectReady?.(cause);this.rejectReady=null;for(const item of this.pending.values())item.reject(cause);this.pending.clear();}
}
export function canUseHandLandmarkerWorker():boolean{return typeof Worker!=="undefined"&&typeof createImageBitmap==="function";}
