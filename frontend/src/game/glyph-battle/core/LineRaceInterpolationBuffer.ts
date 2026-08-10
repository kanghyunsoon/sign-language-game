export class LineRaceInterpolationBuffer {
  private from=0;private target=0;private updatedAt=0;
  constructor(private readonly smoothingMs=180,private readonly snapDistance=120){}
  push(progress:number,at:number){const current=this.valueAt(at);this.from=Math.abs(progress-current)>=this.snapDistance?progress:current;this.target=progress;this.updatedAt=at;}
  valueAt(now:number){if(this.from===this.target)return this.target;const ratio=Math.min(1,Math.max(0,(now-this.updatedAt)/this.smoothingMs));return this.from+(this.target-this.from)*ratio;}
  reset(progress=0,at=0){this.from=this.target=progress;this.updatedAt=at;}
  getTarget(){return this.target;}
}
