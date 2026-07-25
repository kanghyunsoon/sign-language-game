export interface RecognitionPerformanceSnapshot {
  readonly cameraFps: number;
  readonly renderFps: number;
  readonly handTrackingFps: number;
  readonly poseTrackingFps: number;
  readonly aiRequestFps: number;
  readonly aiResponseFps: number;
  readonly aiAverageLatencyMs: number;
  readonly aiP95LatencyMs: number;
  readonly handAverageLatencyMs: number;
  readonly handP95LatencyMs: number;
  readonly droppedHandFrames: number;
  readonly droppedPoseFrames: number;
  readonly droppedInferenceFrames: number;
  readonly staleResponsesIgnored: number;
  readonly mainThreadLongTaskCount: number;
  readonly latestUpdatedAt: number;
}

type RateName = "camera" | "render" | "hand" | "pose" | "aiRequest" | "aiResponse";
const EMPTY: RecognitionPerformanceSnapshot = { cameraFps:0,renderFps:0,handTrackingFps:0,poseTrackingFps:0,aiRequestFps:0,aiResponseFps:0,aiAverageLatencyMs:0,aiP95LatencyMs:0,handAverageLatencyMs:0,handP95LatencyMs:0,droppedHandFrames:0,droppedPoseFrames:0,droppedInferenceFrames:0,staleResponsesIgnored:0,mainThreadLongTaskCount:0,latestUpdatedAt:0 };

export class RecognitionPerformanceMonitor {
  private readonly rates: Record<RateName, number[]> = { camera:[],render:[],hand:[],pose:[],aiRequest:[],aiResponse:[] };
  private aiLatencies: number[] = [];
  private handLatencies: number[] = [];
  private snapshot: RecognitionPerformanceSnapshot = EMPTY;
  private readonly listeners = new Set<(snapshot: RecognitionPerformanceSnapshot) => void>();
  private observer: PerformanceObserver | null = null;
  private lastPublishedAt = Number.NEGATIVE_INFINITY;
  constructor(private readonly now:()=>number=()=>performance.now()) {}

  start(): void {
    if (this.observer) return;
    if (typeof PerformanceObserver === "undefined") return;
    try { this.observer = new PerformanceObserver((list)=>{const count=list.getEntries().length;if(count)this.patch({mainThreadLongTaskCount:this.snapshot.mainThreadLongTaskCount+count});});this.observer.observe({entryTypes:["longtask"]}); } catch { this.observer=null; }
  }
  stop():void{this.observer?.disconnect();this.observer=null;}
  mark(name: RateName, at=this.now()): void { const values=this.rates[name];values.push(at);this.trim(values,at);this.recalculate(at); }
  recordAiLatency(value:number):void{this.recordLatency(this.aiLatencies,value);}
  recordHandLatency(value:number):void{this.recordLatency(this.handLatencies,value);}
  drop(kind:"hand"|"pose"|"inference",count=1):void{const key=kind==="hand"?"droppedHandFrames":kind==="pose"?"droppedPoseFrames":"droppedInferenceFrames";this.patch({[key]:this.snapshot[key]+count} as Pick<RecognitionPerformanceSnapshot,typeof key>);}
  stale(count=1):void{this.patch({staleResponsesIgnored:this.snapshot.staleResponsesIgnored+count});}
  getSnapshot():RecognitionPerformanceSnapshot{return this.snapshot;}
  subscribe(listener:(snapshot:RecognitionPerformanceSnapshot)=>void):()=>void{this.listeners.add(listener);listener(this.snapshot);return()=>this.listeners.delete(listener);}
  dispose():void{this.stop();this.listeners.clear();Object.values(this.rates).forEach((value)=>value.splice(0));this.aiLatencies=[];this.handLatencies=[];}
  private trim(values:number[],at:number){while(values.length&&values[0]!<at-1000)values.shift();}
  private recalculate(at:number){for(const values of Object.values(this.rates))this.trim(values,at);const ai=this.summarize(this.aiLatencies),hand=this.summarize(this.handLatencies);this.snapshot={...this.snapshot,cameraFps:this.rates.camera.length,renderFps:this.rates.render.length,handTrackingFps:this.rates.hand.length,poseTrackingFps:this.rates.pose.length,aiRequestFps:this.rates.aiRequest.length,aiResponseFps:this.rates.aiResponse.length,aiAverageLatencyMs:ai.average,aiP95LatencyMs:ai.p95,handAverageLatencyMs:hand.average,handP95LatencyMs:hand.p95,latestUpdatedAt:Date.now()};if(at-this.lastPublishedAt>=250){this.lastPublishedAt=at;this.publish();}}
  private recordLatency(target:number[],value:number):void{if(Number.isFinite(value)&&value>=0){target.push(value);if(target.length>240)target.splice(0,target.length-240);this.recalculate(this.now());}}
  private summarize(values:number[]):{average:number;p95:number}{const sorted=[...values].sort((a,b)=>a-b);return{average:sorted.length?sorted.reduce((a,b)=>a+b,0)/sorted.length:0,p95:sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]!:0};}
  private patch(patch:Partial<RecognitionPerformanceSnapshot>){this.snapshot={...this.snapshot,...patch,latestUpdatedAt:Date.now()};this.publish();}
  private publish(){for(const listener of this.listeners)listener(this.snapshot);}
}
