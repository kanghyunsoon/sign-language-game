import type { GameRecognitionEvent, GameRecognitionSnapshot } from "../session";

export type RecognitionEvaluationMode = "CONTINUOUS_SIGNS" | "REPEATED_SIGN" | "CROWD_PASSING" | "UNAUTHORIZED_HAND" | "OCCLUSION" | "PERFORMANCE";

export interface RecognitionEvaluationResult {
  readonly durationMs: number;
  readonly cameraFpsAverage: number;
  readonly renderFpsAverage: number;
  readonly handFpsAverage: number;
  readonly poseFpsAverage: number;
  readonly aiLatencyAverageMs: number;
  readonly aiLatencyP95Ms: number;
  readonly signConfirmationAverageMs: number;
  readonly signConfirmationP95Ms: number;
  readonly expectedSignCount: number;
  readonly confirmedSignCount: number;
  readonly missedSignCount: number;
  readonly falseConfirmationCount: number;
  readonly transitionFalsePositiveCount: number;
  readonly duplicateConfirmationCount: number;
  readonly activePlayerIdSwitchCount: number;
  readonly unauthorizedHandAcceptedCount: number;
  readonly activePlayerReacquiredCount: number;
  readonly activePlayerLostCount: number;
  readonly droppedFrames: number;
  readonly staleResponsesIgnored: number;
}

export interface RecognitionEvaluationLogEntry { readonly at:number;readonly kind:string;readonly detail:string; }

export class RecognitionEvaluationCollector {
  private startedAt=0;private finishedAt=0;private mode:RecognitionEvaluationMode="PERFORMANCE";private expected:string[]=[];private expectedIndex=0;private confirmed=0;private falseConfirmations=0;private transitionFalsePositives=0;private duplicates=0;private unauthorized=0;private reacquired=0;private lost=0;private lastSymbol:string|undefined;private released=true;private previousPlayerState:GameRecognitionSnapshot["activePlayerState"]|undefined;private initialSwitches:number|undefined;private latestSwitches=0;private samples:GameRecognitionSnapshot["performance"][]=[];private latencies:number[]=[];private logs:RecognitionEvaluationLogEntry[]=[];
  constructor(private readonly now:()=>number=()=>Date.now()){}
  start(mode:RecognitionEvaluationMode,expected:readonly string[]):void{this.reset();this.startedAt=this.now();this.mode=mode;this.expected=[...expected];}
  accept(event:GameRecognitionEvent,snapshot:GameRecognitionSnapshot,decoderLatencyMs?:number):void{
    if(!this.startedAt||this.finishedAt)return;
    this.sample(snapshot);
    if(event.type==="HAND_RELEASED"){this.released=true;this.log("RELEASE","hand released");return;}
    if(event.type!=="SIGN_CONFIRMED")return;
    this.confirmed+=1;if(this.mode==="UNAUTHORIZED_HAND")this.unauthorized+=1;if(Number.isFinite(decoderLatencyMs))this.latencies.push(decoderLatencyMs!);
    const duplicate=this.lastSymbol===event.symbol&&!this.released;if(duplicate)this.duplicates+=1;
    this.lastSymbol=event.symbol;this.released=false;
    const expected=this.expected[this.expectedIndex];
    if(expected===event.symbol)this.expectedIndex+=1;else{this.falseConfirmations+=1;if(!duplicate&&this.expected.slice(this.expectedIndex+1).includes(event.symbol))this.transitionFalsePositives+=1;}
    this.log("CONFIRMED",`${event.symbol}${expected?` (expected ${expected})`:""}`);
  }
  sample(snapshot:GameRecognitionSnapshot,idSwitchCount?:number):void{
    if(!this.startedAt||this.finishedAt)return;this.samples.push(snapshot.performance);if(this.samples.length>1200)this.samples.shift();
    if(idSwitchCount!==undefined){if(this.initialSwitches===undefined)this.initialSwitches=idSwitchCount;this.latestSwitches=idSwitchCount;}
    const state=snapshot.activePlayerState,previous=this.previousPlayerState;
    if(previous&&previous!==state){if(["TEMPORARILY_LOST","REIDENTIFYING","USER_LOST"].includes(state))this.lost+=1;if(["TEMPORARILY_LOST","REIDENTIFYING"].includes(previous)&&state==="LOCKED")this.reacquired+=1;}
    this.previousPlayerState=state;
  }
  markUnauthorizedAttemptAccepted(symbol="unknown"):void{if(!this.startedAt||this.finishedAt)return;this.unauthorized+=1;this.log("UNAUTHORIZED",symbol);}
  stop():RecognitionEvaluationResult{if(this.startedAt&&!this.finishedAt)this.finishedAt=this.now();return this.result();}
  getLogs():readonly RecognitionEvaluationLogEntry[]{return [...this.logs];}
  result():RecognitionEvaluationResult{const durationMs=this.startedAt?Math.max(0,(this.finishedAt||this.now())-this.startedAt):0,avg=(selector:(sample:GameRecognitionSnapshot["performance"])=>number)=>average(this.samples.map(selector)),sorted=[...this.latencies].sort((a,b)=>a-b),p95=sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]!:0,latest=this.samples.at(-1);return{durationMs,cameraFpsAverage:avg(x=>x.cameraFps),renderFpsAverage:avg(x=>x.renderFps),handFpsAverage:avg(x=>x.handTrackingFps),poseFpsAverage:avg(x=>x.poseTrackingFps),aiLatencyAverageMs:avg(x=>x.aiAverageLatencyMs),aiLatencyP95Ms:Math.max(0,...this.samples.map(x=>x.aiP95LatencyMs)),signConfirmationAverageMs:average(sorted),signConfirmationP95Ms:p95,expectedSignCount:this.expected.length,confirmedSignCount:this.expectedIndex,missedSignCount:Math.max(0,this.expected.length-this.expectedIndex),falseConfirmationCount:this.falseConfirmations,transitionFalsePositiveCount:this.transitionFalsePositives,duplicateConfirmationCount:this.duplicates,activePlayerIdSwitchCount:Math.max(0,this.latestSwitches-(this.initialSwitches??this.latestSwitches)),unauthorizedHandAcceptedCount:this.unauthorized,activePlayerReacquiredCount:this.reacquired,activePlayerLostCount:this.lost,droppedFrames:(latest?.droppedHandFrames??0)+(latest?.droppedPoseFrames??0)+(latest?.droppedInferenceFrames??0),staleResponsesIgnored:latest?.staleResponsesIgnored??0};}
  private reset(){this.startedAt=0;this.finishedAt=0;this.mode="PERFORMANCE";this.expected=[];this.expectedIndex=0;this.confirmed=0;this.falseConfirmations=0;this.transitionFalsePositives=0;this.duplicates=0;this.unauthorized=0;this.reacquired=0;this.lost=0;this.lastSymbol=undefined;this.released=true;this.previousPlayerState=undefined;this.initialSwitches=undefined;this.latestSwitches=0;this.samples=[];this.latencies=[];this.logs=[];}
  private log(kind:string,detail:string){this.logs.unshift({at:this.now(),kind,detail});if(this.logs.length>100)this.logs.pop();}
}
function average(values:readonly number[]):number{return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;}
