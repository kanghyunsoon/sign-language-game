export interface LineRaceServerClock { updateOffset(options:{serverTime:number;clientSentAt?:number;clientReceivedAt:number}):void;now():number; }
export class EstimatedLineRaceServerClock implements LineRaceServerClock {
  private offsetMs=0; private initialized=false;
  constructor(private readonly localNow:()=>number=()=>Date.now()){}
  updateOffset({serverTime,clientSentAt,clientReceivedAt}:{serverTime:number;clientSentAt?:number;clientReceivedAt:number}){
    const localEstimate=clientSentAt===undefined?clientReceivedAt:(clientSentAt+clientReceivedAt)/2;
    const sample=serverTime-localEstimate; this.offsetMs=this.initialized?this.offsetMs*.75+sample*.25:sample;this.initialized=true;
  }
  now(){return this.localNow()+this.offsetMs;}
  getOffsetMs(){return this.offsetMs;}
}
