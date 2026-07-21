import { Application, Container, Graphics } from "pixi.js";
import type { LineRaceRuntimeConfig, LineRaceRuntimeSnapshot } from "../core";
import { RaceLaneRenderer } from "./RaceLaneRenderer";
import { JamoObstacleRenderer, type LineRaceObstacleFeedback } from "./JamoObstacleRenderer";
import { preloadRaceRunnerAsset } from "./RaceRunnerRenderer";
import { GlyphDuelHudRenderer } from "./GlyphDuelHudRenderer";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";

type FrameHandler = () => void;

export interface LineRaceResizeObserver {
  observe(target: Element): void;
  disconnect(): void;
}

export interface LineRaceRendererOptions {
  readonly createResizeObserver?: (callback: ResizeObserverCallback) => LineRaceResizeObserver;
}

export const LINE_RACE_RENDERER_REVISION = "otter-riverside-duel-v2";

export class LineRaceRenderer {
  private readonly root = new Container();
  private readonly backdrop = new Graphics();
  private readonly duelHud = new GlyphDuelHudRenderer();
  private duelView: GlyphDuelView | null = null;
  private readonly laneA = new RaceLaneRenderer("PLAYER_A");
  private readonly laneB = new RaceLaneRenderer("PLAYER_B");
  private obstacleRenderer: JamoObstacleRenderer | null;
  private resizeObserver: LineRaceResizeObserver | null;
  private frameHandler: FrameHandler | null = null;
  private destroyed = false;
  private app: Application | null;
  private mount: HTMLElement | null;
  private readonly tick = () => this.frameHandler?.();

  private constructor(
    app: Application,
    mount: HTMLElement,
    private readonly config: LineRaceRuntimeConfig,
    options: LineRaceRendererOptions,
  ) {
    this.app = app;
    this.mount = mount;
    this.obstacleRenderer = new JamoObstacleRenderer(config.raceLength);
    // The old line-race obstacle/path layer is intentionally not mounted in
    // turn-battle mode. Legacy events may still feed the compatibility model,
    // but glyphs must never become a road that fighters follow.
    this.root.addChild(this.backdrop, this.laneA.root, this.laneB.root, this.duelHud.root);
    app.stage.addChild(this.root);
    const createObserver = options.createResizeObserver
      ?? (typeof ResizeObserver === "undefined" ? null : (callback: ResizeObserverCallback) => new ResizeObserver(callback));
    this.resizeObserver = createObserver?.(() => this.resizeToMount()) ?? null;
    this.resizeObserver?.observe(mount);
    this.resizeToMount();
  }

  static async create(
    mount: HTMLElement,
    config: LineRaceRuntimeConfig,
    options: LineRaceRendererOptions = {},
  ): Promise<LineRaceRenderer> {
    const app = new Application();
    const width = Math.max(320, mount.clientWidth || 960);
    const height = Math.max(240, mount.clientHeight || 520);
    try {
      await app.init({ width, height, background: 0xf7f4ec, antialias: true, resolution: 1, autoDensity: true });
      app.ticker.maxFPS=60;
      await preloadRaceRunnerAsset();
      mount.replaceChildren(app.canvas);
      app.stop();
      return new LineRaceRenderer(app, mount, config, options);
    } catch (cause) {
      try { app.destroy({ removeView: true }, { children: true }); } catch { /* init may have only partially created the canvas */ }
      throw cause;
    }
  }

  start(frameHandler: FrameHandler): void {
    const app = this.requireApp();
    if (this.frameHandler) this.stop();
    this.frameHandler = frameHandler;
    app.ticker.add(this.tick);
    app.start();
  }

  stop(): void {
    if (!this.frameHandler) return;
    const app = this.app;
    app?.ticker.remove(this.tick);
    app?.stop();
    this.frameHandler = null;
  }

  render(snapshot: LineRaceRuntimeSnapshot): void {
    const app = this.requireApp();
    const obstacleRenderer = this.obstacleRenderer;
    if (!obstacleRenderer) return;
    const duelNow=Date.now();
    this.laneA.render(snapshot, this.config.raceLength, undefined, [], 0, this.duelView,duelNow);
    this.laneB.render(snapshot, this.config.raceLength, undefined, [], 0, this.duelView,duelNow);
    this.duelHud.render(this.duelView, duelNow);
    app.render();
  }

  resize(width: number, height: number): void {
    const app = this.requireApp();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RangeError("Line-race renderer dimensions must be positive finite numbers.");
    }
    app.renderer.resize(width, height);
    const compactArena=height<330;
    const arenaY = compactArena?height-48:Math.min(height - 105, Math.max(225, height * .61));
    const ink=0x171717, paper=0xf7f4ec, horizon=arenaY-112;
    this.backdrop.clear().rect(0,0,width,height).fill({color:paper});

    // Paper grain: thin imperfect strokes instead of a synthetic gradient.
    for(let row=0;row<8;row+=1){const y=24+row*(height-40)/7;this.backdrop.moveTo(0,y).bezierCurveTo(width*.3,y+(row%2?2:-1),width*.72,y+(row%3-1)*2,width,y).stroke({color:ink,width:1,alpha:.045});}
    for(let index=0;index<28;index+=1){const x=(index*97+31)%Math.max(1,width),y=(index*53+17)%Math.max(1,height);this.backdrop.moveTo(x-2,y).lineTo(x+2,y+(index%2?1:-1)).stroke({color:ink,width:1,alpha:.08});}

    // Far riverbank: hand-drawn reeds, low roofs and a long pedestrian bridge.
    this.backdrop.moveTo(0,horizon-28).bezierCurveTo(width*.18,horizon-49,width*.34,horizon-21,width*.5,horizon-39).bezierCurveTo(width*.7,horizon-58,width*.84,horizon-22,width,horizon-43).stroke({color:ink,width:2,alpha:.16});
    for(let index=0;index<9;index+=1){const x=24+index*(width-48)/8;const roofY=horizon-39-(index%3)*4;this.backdrop.moveTo(x-18,roofY).lineTo(x,roofY-10).lineTo(x+19,roofY).lineTo(x+14,roofY+12).lineTo(x-13,roofY+12).closePath().stroke({color:ink,width:1.5,alpha:.12});}
    this.backdrop.moveTo(0,horizon-2).bezierCurveTo(width*.25,horizon-9,width*.74,horizon+5,width,horizon-4).stroke({color:ink,width:3,alpha:.27});
    this.backdrop.moveTo(0,horizon+10).bezierCurveTo(width*.28,horizon+3,width*.72,horizon+17,width,horizon+8).stroke({color:ink,width:2,alpha:.2});
    for(let pier=0;pier<5;pier+=1){const left=pier*width/4-width*.07,right=left+width*.14,center=(left+right)/2;this.backdrop.moveTo(left,horizon+10).bezierCurveTo(left+7,horizon-22,right-7,horizon-22,right,horizon+10).stroke({color:ink,width:2,alpha:.2});this.backdrop.moveTo(center-4,horizon+10).lineTo(center-7,horizon+47).lineTo(center+7,horizon+47).lineTo(center+4,horizon+10).stroke({color:ink,width:2,alpha:.16});}

    // Crowd and banners are deliberately loose so they read as atmosphere.
    for(let index=0;index<24;index+=1){const x=18+index*(width-36)/23,headY=horizon-12-(index%4)*3;this.backdrop.arc(x,headY,3.2,Math.PI,0).stroke({color:ink,width:1.5,alpha:.2});this.backdrop.moveTo(x,headY+3).lineTo(x+(index%2?3:-3),horizon-1).stroke({color:ink,width:1.5,alpha:.16});}
    for(const flagX of [width*.08,width*.92]){const side=flagX<width/2?1:-1;this.backdrop.moveTo(flagX,horizon+4).lineTo(flagX,horizon-72).stroke({color:ink,width:3,alpha:.42});this.backdrop.moveTo(flagX,horizon-69).lineTo(flagX+side*39,horizon-57).lineTo(flagX,horizon-43).closePath().fill({color:paper}).stroke({color:ink,width:2,alpha:.5});this.backdrop.moveTo(flagX+side*8,horizon-61).lineTo(flagX+side*29,horizon-54).stroke({color:ink,width:2,alpha:.24});}

    // Water lines beneath the bridge.
    for(let line=0;line<5;line+=1){const y=horizon+24+line*12;this.backdrop.moveTo((line%2)*width*.08,y).bezierCurveTo(width*.24,y-3,width*.41,y+4,width*.58,y).bezierCurveTo(width*.74,y-3,width*.86,y+3,width-(line%2)*width*.06,y).stroke({color:ink,width:1.5,alpha:.11});}

    // Foreground wooden duel deck: trapezoid and perspective planks, no giant circles.
    const topY=arenaY-38,bottomY=Math.min(height-10,arenaY+114),topLeft=width*.31,topRight=width*.69,bottomLeft=16,bottomRight=width-16;
    this.backdrop.moveTo(topLeft,topY).lineTo(topRight,topY).lineTo(bottomRight,bottomY).lineTo(bottomLeft,bottomY).closePath().fill({color:0xfbf9f2,alpha:.92}).stroke({color:ink,width:4,alpha:.55});
    for(let plank=1;plank<6;plank+=1){const t=plank/6,eased=t*t;const y=topY+(bottomY-topY)*eased;const left=topLeft+(bottomLeft-topLeft)*eased,right=topRight+(bottomRight-topRight)*eased;this.backdrop.moveTo(left,y).bezierCurveTo(left+(right-left)*.28,y+(plank%2?2:-1),left+(right-left)*.7,y-(plank%3),right,y+1).stroke({color:ink,width:1.5,alpha:.19});}
    for(let board=0;board<=10;board+=1){const topX=topLeft+(topRight-topLeft)*board/10,bottomX=bottomLeft+(bottomRight-bottomLeft)*board/10;this.backdrop.moveTo(topX,topY).lineTo(bottomX,bottomY).stroke({color:ink,width:1,alpha:.12});}
    this.backdrop.moveTo(width*.5,topY).lineTo(width*.5,bottomY).stroke({color:ink,width:2,alpha:.2});
    this.backdrop.moveTo(bottomLeft,bottomY-4).bezierCurveTo(width*.32,bottomY-9,width*.7,bottomY+2,bottomRight,bottomY-4).stroke({color:ink,width:3,alpha:.38});
    this.laneA.resize(width, arenaY,compactArena ? .82 : 1);
    this.laneB.resize(width, arenaY,compactArena ? .82 : 1);
    this.obstacleRenderer?.resize(width, height, arenaY, arenaY);
    this.duelHud.resize(width,height);
    app.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const app = this.app;
    const mount = this.mount;
    const canvas = app?.canvas ?? null;
    const ownsMountedCanvas = Boolean(canvas && mount && canvas.parentElement === mount);
    this.stop();
    const observer = this.resizeObserver;
    this.resizeObserver = null;
    try { observer?.disconnect(); } catch { /* already disconnected */ }
    const obstacleRenderer = this.obstacleRenderer;
    this.obstacleRenderer = null;
    try { obstacleRenderer?.destroy(); } catch { /* already destroyed */ }
    this.app = null;
    this.mount = null;
    try { app?.destroy({ removeView: true }, { children: true }); } catch { /* partially destroyed Pixi app */ }
    if (ownsMountedCanvas && canvas?.parentElement === mount) canvas.remove();
  }

  setPathDebugVisible(visible: boolean): void {
    this.requireApp();
    this.obstacleRenderer?.setDebugVisible(visible);
  }

  setObstacleFeedback(feedback: LineRaceObstacleFeedback): void {
    this.requireApp();
    this.obstacleRenderer?.setFeedback(feedback);
  }

  setDuelView(view: GlyphDuelView): void { this.requireApp(); this.duelView=view; }

  private resizeToMount(): void {
    if (this.destroyed) return;
    const mount = this.mount;
    if (!mount) return;
    this.resize(Math.max(320, mount.clientWidth || 960), Math.max(240, mount.clientHeight || 520));
  }

  private requireApp(): Application {
    if (this.destroyed || !this.app) throw new Error("Line-race renderer has been destroyed.");
    return this.app;
  }
}
