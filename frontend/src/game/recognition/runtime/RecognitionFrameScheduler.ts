import type { RecognitionRateConfig } from "./RecognitionRateConfig";
import { DEFAULT_RECOGNITION_RATE_CONFIG, validateRecognitionRateConfig } from "./RecognitionRateConfig";
import type { RecognitionPerformanceMonitor } from "./RecognitionPerformanceMonitor";

export interface RecognitionVideoFrame { readonly frameId:number;readonly capturedAt:number;readonly mediaTime:number;readonly video:HTMLVideoElement; }
export interface RecognitionFrameScheduler { start():void;pause():void;resume():void;stop():void;subscribeRenderFrame(listener:(frame:RecognitionVideoFrame)=>void):()=>void;subscribeHandFrame(listener:(frame:RecognitionVideoFrame)=>void):()=>void;subscribePoseFrame(listener:(frame:RecognitionVideoFrame)=>void):()=>void;dispose():void; }
type Consumer="render"|"hand"|"pose";
export interface BrowserRecognitionFrameSchedulerOptions { readonly video:HTMLVideoElement;readonly config?:RecognitionRateConfig;readonly monitor?:RecognitionPerformanceMonitor;readonly now?:()=>number;readonly requestFrame?:(callback:FrameRequestCallback)=>number;readonly cancelFrame?:(id:number)=>void; }

export class BrowserRecognitionFrameScheduler implements RecognitionFrameScheduler {
  private readonly listeners:Record<Consumer,Set<(frame:RecognitionVideoFrame)=>void>>={render:new Set(),hand:new Set(),pose:new Set()};
  private readonly last:Record<Consumer,number>={render:Number.NEGATIVE_INFINITY,hand:Number.NEGATIVE_INFINITY,pose:Number.NEGATIVE_INFINITY};
  private frameId=0;private handle:number|null=null;private running=false;private paused=false;private disposed=false;private lastMediaTime=Number.NEGATIVE_INFINITY;
  private readonly config:RecognitionRateConfig;private readonly now:()=>number;private readonly requestFrame:(callback:FrameRequestCallback)=>number;private readonly cancelFrame:(id:number)=>void;
  constructor(private readonly options:BrowserRecognitionFrameSchedulerOptions){this.config=validateRecognitionRateConfig(options.config??DEFAULT_RECOGNITION_RATE_CONFIG);this.now=options.now??(()=>performance.now());this.requestFrame=options.requestFrame??((callback)=>requestAnimationFrame(callback));this.cancelFrame=options.cancelFrame??((id)=>cancelAnimationFrame(id));}
  start(){if(this.disposed)throw new Error("Recognition scheduler is disposed.");if(this.running)return;this.running=true;this.paused=false;this.handle=this.requestFrame(this.tick);}
  pause(){if(this.running)this.paused=true;}
  resume(){if(this.running)this.paused=false;}
  stop(){this.running=false;if(this.handle!==null)this.cancelFrame(this.handle);this.handle=null;}
  subscribeRenderFrame(listener:(frame:RecognitionVideoFrame)=>void){return this.subscribe("render",listener);}subscribeHandFrame(listener:(frame:RecognitionVideoFrame)=>void){return this.subscribe("hand",listener);}subscribePoseFrame(listener:(frame:RecognitionVideoFrame)=>void){return this.subscribe("pose",listener);}
  dispose(){if(this.disposed)return;this.stop();this.disposed=true;Object.values(this.listeners).forEach((set)=>set.clear());}
  private subscribe(kind:Consumer,listener:(frame:RecognitionVideoFrame)=>void){if(this.disposed)throw new Error("Recognition scheduler is disposed.");this.listeners[kind].add(listener);return()=>this.listeners[kind].delete(listener);}
  private tick=(at:number)=>{if(!this.running)return;if(!this.paused&&this.options.video.readyState>=2){const now=this.now();this.frameId+=1;const mediaTime=this.options.video.currentTime;const frame={frameId:this.frameId,capturedAt:Date.now(),mediaTime,video:this.options.video};if(mediaTime!==this.lastMediaTime){this.lastMediaTime=mediaTime;this.options.monitor?.mark("camera",now);}this.emitDue("render",frame,now,this.config.renderFps);this.emitDue("hand",frame,now,this.config.handTrackingFps);this.emitDue("pose",frame,now,this.config.poseTrackingFps);}this.handle=this.requestFrame(this.tick);void at;};
  private emitDue(kind:Consumer,frame:RecognitionVideoFrame,at:number,fps:number){if(this.listeners[kind].size===0||at-this.last[kind]<1000/fps)return;this.last[kind]=at;if(kind==="render")this.options.monitor?.mark("render",at);for(const listener of this.listeners[kind]){try{listener(frame);}catch{/* one consumer must not stop the other schedules */}}}
}
