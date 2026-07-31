import { Application, Container, Graphics } from "pixi.js";

import {
  GLYPH_DISPLAY_FONT_RATIO,
  GLYPH_SOURCE_FONT_SIZE,
  createGlyphRaster,
  prepareGameGlyphFont,
} from "../glyphs/glyphRaster";
import type { PhysicsLetterState } from "../physics/types";
import { LetterViewFactory, type LetterView } from "./LetterViewFactory";
import { RemovalBurst } from "./RemovalBurst";
import { RemovalEffect } from "./RemovalEffect";
import {
  DEFAULT_RENDERER_CONFIG,
  type GameRenderer,
  type RemovalEffectFinishedEvent,
  type RendererConfig,
} from "./types";

const POSITION_RENDER_EPSILON = 0.05;
const ROTATION_RENDER_EPSILON = 0.0005;
const SPAWN_EFFECT_DURATION_MS = 520;

export class PixiGameRenderer implements GameRenderer {
  private readonly lettersLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly boardScenery = new Graphics();
  private readonly boardGrid = new Graphics();
  private readonly dangerLine = new Graphics();
  private readonly views = new Map<string, LetterView>();
  private readonly removalEffects = new Map<string, { readonly effect: RemovalEffect; readonly burst: RemovalBurst }>();
  private readonly spawnEffects = new Map<string, number>();
  private readonly hiddenLetterIds = new Set<string>();
  /**
   * Physics glyphs deliberately live in their own DOM layer.  The scenery
   * canvas stays below the otter/start UI while a falling letter can remain
   * above the paper for its entire physical lifetime.
   */
  private readonly frontLetterLayer: HTMLDivElement;
  private readonly frontLetterHost: HTMLElement;
  private readonly rendererHost: HTMLElement;
  private readonly frontLetters = new Map<string, HTMLSpanElement>();
  private readonly frontLetterSignatures = new Map<string, string>();
  private readonly frontLetterMasks = new Map<string, {
    readonly url: string;
    readonly width: number;
    readonly height: number;
  }>();
  private readonly viewFactory = new LetterViewFactory();
  private targetId: string | null = null;
  private width: number;
  private height: number;
  private destroyed = false;

  private constructor(
    private readonly app: Application,
    private readonly config: RendererConfig,
    mount: HTMLElement,
  ) {
    this.width = config.width;
    this.height = config.height;
    this.overlayLayer.addChild(this.dangerLine);
    this.app.stage.addChild(this.boardScenery, this.boardGrid, this.lettersLayer, this.overlayLayer);
    this.frontLetterLayer = document.createElement("div");
    this.frontLetterLayer.className = "solo-physics-letter-layer";
    this.frontLetterLayer.setAttribute("aria-hidden", "true");
    this.rendererHost = mount;
    // The canvas is clipped by the rounded game-board frame. Keeping the
    // falling glyph inside that element made the completed paper glyph look
    // as if it disappeared behind the paper before reappearing below it.
    // Mount only the glyph layer on the unclipped board wrapper so the same
    // foreground glyph can grow on the paper and continue falling in front.
    this.frontLetterHost = mount.closest<HTMLElement>(".solo-stage-column") ?? mount;
    this.frontLetterHost.append(this.frontLetterLayer);
    this.syncFrontLetterLayerBounds();
    this.drawBoardScenery();
    this.drawBoardGrid();
    this.drawDangerLine();
  }

  static async create(
    mount: HTMLElement,
    config: Partial<RendererConfig> = {},
  ): Promise<PixiGameRenderer> {
    const resolvedConfig = { ...DEFAULT_RENDERER_CONFIG, ...config };
    await prepareGameGlyphFont();
    const app = new Application();
    await app.init({
      width: resolvedConfig.width,
      height: resolvedConfig.height,
      backgroundColor: 0xdff1ff,
      backgroundAlpha: 0,
      antialias: false,
      preference: "webgl",
      resolution: 1,
      autoDensity: true,
    });

    mount.replaceChildren(app.canvas);
    // Solo mode supplies its animated scenery from the DOM layer below Pixi.
    // Other modes keep the renderer-owned static scenery by default.
    app.renderer.background.alpha = resolvedConfig.showScenery ? 1 : 0;
    // In battle mode the shared DOM backdrop is the only scenery source and
    // glyphs are rendered in the front DOM layer below. Some WebGL drivers
    // still present a transparent Pixi clear buffer as white, despite
    // backgroundAlpha: 0. Hide just that canvas so it cannot mask the shared
    // backdrop while keeping the renderer alive for state and effects.
    if (!resolvedConfig.showScenery) {
      app.canvas.style.visibility = "hidden";
      app.canvas.style.pointerEvents = "none";
    }
    const renderer = new PixiGameRenderer(app, resolvedConfig, mount);
    app.stop();
    return renderer;
  }

  resize(width: number, height: number): void {
    this.assertActive();
    this.assertSize(width, height);
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.syncFrontLetterLayerBounds();
    this.drawBoardScenery();
    this.drawBoardGrid();
    this.drawDangerLine();
    if (this.config.showScenery) this.app.render();
  }

  render(letters: readonly PhysicsLetterState[]): void {
    this.assertActive();
    const activeIds = new Set<string>();

    for (const letter of letters) {
      activeIds.add(letter.id);
      const view = this.getOrCreateView(letter);
      const display = this.toDisplayState(letter);
      // Keep Pixi for scenery/effects only.  A separate DOM glyph is the one
      // visible to the player, so it can sit above the otter without raising
      // the entire board canvas above the start overlay.
      view.setVisible(false);
      if (
        Math.abs(view.root.x - display.x) >= POSITION_RENDER_EPSILON
        || Math.abs(view.root.y - display.y) >= POSITION_RENDER_EPSILON
      ) {
        view.root.position.set(display.x, display.y);
      }
      if (Math.abs(view.root.rotation - letter.angle) >= ROTATION_RENDER_EPSILON) {
        view.root.rotation = letter.angle;
      }
      view.setMotionState(letter.velocityY, letter.settled);
      const spawnElapsedMs = this.spawnEffects.get(letter.id);
      view.setSpawnProgress(spawnElapsedMs === undefined ? null : Math.min(1, spawnElapsedMs / SPAWN_EFFECT_DURATION_MS));
      this.renderFrontLetter(letter, display.x, display.y, spawnElapsedMs);
    }

    for (const [id, view] of this.views) {
      if (!activeIds.has(id)) {
        view.destroy();
        this.views.delete(id);
        this.removalEffects.get(id)?.burst.destroy();
        this.removalEffects.delete(id);
        this.spawnEffects.delete(id);
        this.hiddenLetterIds.delete(id);
        this.frontLetters.get(id)?.remove();
        this.frontLetters.delete(id);
        this.frontLetterSignatures.delete(id);
      }
    }
    // Battle and solo DOM scenery modes render glyphs in the foreground DOM
    // layer. Their Pixi canvas is hidden, so submitting a WebGL frame here
    // wastes a full GPU render for every physics tick.
    if (this.config.showScenery) this.app.render();
  }

  highlightRemoval(
    id: string,
    durationMs = this.config.removalHighlightDurationMs,
  ): void {
    this.assertActive();
    const view = this.views.get(id);
    if (!view || this.removalEffects.has(id)) {
      return;
    }

    view.setRemovalHighlighted(true);
    const burst = new RemovalBurst(view.root.x, view.root.y);
    this.overlayLayer.addChild(burst.root);
    this.removalEffects.set(id, { effect: new RemovalEffect(id, durationMs), burst });
  }

  startSpawnEffect(id: string): void {
    this.assertActive();
    // The paper animation has already completed most of the red-to-gold
    // transition. Continue from that colour rather than flashing back red.
    this.spawnEffects.set(id, SPAWN_EFFECT_DURATION_MS * .58);
  }

  setLetterVisible(id: string, visible: boolean): void {
    this.assertActive();
    if (visible) this.hiddenLetterIds.delete(id);
    else this.hiddenLetterIds.add(id);
    this.views.get(id)?.setVisible(visible);
  }

  setTarget(id: string | null): void {
    this.assertActive();
    if (this.targetId === id) return;
    if (this.targetId) this.views.get(this.targetId)?.setTargetHighlighted(false);
    this.targetId = id;
    if (id) this.views.get(id)?.setTargetHighlighted(true);
  }

  updateEffects(deltaMs: number): readonly RemovalEffectFinishedEvent[] {
    this.assertActive();
    const finished: RemovalEffectFinishedEvent[] = [];

    for (const [id, elapsedMs] of this.spawnEffects) {
      this.spawnEffects.set(id, Math.min(SPAWN_EFFECT_DURATION_MS, elapsedMs + deltaMs));
    }

    for (const [id, activeEffect] of this.removalEffects) {
      const view = this.views.get(id);
      const progress = activeEffect.effect.advance(deltaMs);
      activeEffect.burst.update(progress);
      if (view) {
        const pop = Math.sin(Math.min(progress / 0.65, 1) * Math.PI) * 0.55;
        const collapse = progress > 0.55 ? ((progress - 0.55) / 0.45) * 0.92 : 0;
        view.root.scale.set(1 + pop - collapse);
        view.root.alpha = 1 - progress ** 2;
      }

      if (activeEffect.effect.isFinished) {
        finished.push({ type: "REMOVAL_EFFECT_FINISHED", id });
        activeEffect.burst.destroy();
        this.removalEffects.delete(id);
      }
    }

    return finished;
  }

  clear(): void {
    this.assertActive();
    for (const view of this.views.values()) {
      view.destroy();
    }
    for (const activeEffect of this.removalEffects.values()) activeEffect.burst.destroy();
    this.views.clear();
    this.removalEffects.clear();
    this.spawnEffects.clear();
    this.hiddenLetterIds.clear();
    for (const glyph of this.frontLetters.values()) glyph.remove();
    this.frontLetters.clear();
    this.frontLetterSignatures.clear();
    this.targetId = null;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.clear();
    this.viewFactory.destroy();
    this.frontLetterLayer.remove();
    this.destroyed = true;
    this.app.destroy({ removeView: true }, { children: true });
  }

  private getOrCreateView(letter: PhysicsLetterState): LetterView {
    const existing = this.views.get(letter.id);
    if (existing) {
      return existing;
    }

    const view = this.viewFactory.create({
      id: letter.id,
      symbol: letter.symbol,
      width: this.config.letterWidth,
      height: this.config.letterHeight,
    });
    this.views.set(letter.id, view);
    if (letter.id === this.targetId) view.setTargetHighlighted(true);
    this.lettersLayer.addChild(view.root);
    return view;
  }

  private renderFrontLetter(
    letter: PhysicsLetterState,
    displayX: number,
    displayY: number,
    spawnElapsedMs: number | undefined,
  ): void {
    let glyph = this.frontLetters.get(letter.id);
    if (!glyph) {
      glyph = document.createElement("span");
      glyph.className = "solo-physics-letter";
      const mask = this.getFrontLetterMask(letter.symbol);
      glyph.style.width = `${mask.width}px`;
      glyph.style.height = `${mask.height}px`;
      glyph.style.maskImage = `url("${mask.url}")`;
      glyph.style.webkitMaskImage = `url("${mask.url}")`;
      this.frontLetterLayer.append(glyph);
      this.frontLetters.set(letter.id, glyph);
    }

    const spawnProgress = spawnElapsedMs === undefined ? 1 : Math.min(1, spawnElapsedMs / SPAWN_EFFECT_DURATION_MS);
    const color = spawnElapsedMs === undefined
      ? (letter.id === this.targetId ? "#d95b7d" : "#416d72")
      : `hsl(${16 + spawnProgress * 28} 88% ${57 - spawnProgress * 7}%)`;
    const motion = letter.settled ? 0 : Math.min(1, Math.abs(letter.velocityY) / 4.5);
    const signature = [
      displayX.toFixed(2),
      displayY.toFixed(2),
      letter.angle.toFixed(4),
      color,
      motion.toFixed(3),
      this.hiddenLetterIds.has(letter.id) ? "0" : "1",
    ].join(":");
    if (this.frontLetterSignatures.get(letter.id) === signature) return;
    this.frontLetterSignatures.set(letter.id, signature);
    glyph.style.display = this.hiddenLetterIds.has(letter.id) ? "none" : "block";
    glyph.style.backgroundColor = color;
    const scaleX = this.width / (this.config.coordinateWidth ?? this.width);
    const scaleY = this.height / (this.config.coordinateHeight ?? this.height);
    glyph.style.transform = `translate(-50%, -50%) translate(${displayX}px, ${displayY}px) rotate(${letter.angle}rad) scale(${scaleX * (1 - motion * .018)}, ${scaleY * (1 + motion * .032)})`;
  }

  private toDisplayState(letter: PhysicsLetterState): { readonly x: number; readonly y: number } {
    return {
      x: letter.x * this.width / (this.config.coordinateWidth ?? this.width),
      y: letter.y * this.height / (this.config.coordinateHeight ?? this.height),
    };
  }

  private getFrontLetterMask(symbol: string): {
    readonly url: string;
    readonly width: number;
    readonly height: number;
  } {
    const cached = this.frontLetterMasks.get(symbol);
    if (cached) return cached;
    const raster = createGlyphRaster(symbol);
    const scale = Math.min(this.config.letterWidth, this.config.letterHeight)
      * GLYPH_DISPLAY_FONT_RATIO / GLYPH_SOURCE_FONT_SIZE;
    const mask = {
      url: raster.canvas.toDataURL("image/png"),
      width: raster.canvas.width * scale,
      height: raster.canvas.height * scale,
    };
    this.frontLetterMasks.set(symbol, mask);
    return mask;
  }

  private syncFrontLetterLayerBounds(): void {
    if (this.frontLetterHost === this.rendererHost) {
      this.frontLetterLayer.style.inset = "0";
      this.frontLetterLayer.style.width = "";
      this.frontLetterLayer.style.height = "";
      return;
    }

    const hostBounds = this.rendererHost.getBoundingClientRect();
    const overlayBounds = this.frontLetterHost.getBoundingClientRect();
    // The solo page is uniformly scaled to fit the browser viewport. DOM
    // rectangles include that visual scale, while inline left/top/width/height
    // values are laid out in the unscaled game coordinate system. Convert back
    // before positioning the foreground glyph layer so browser zoom cannot
    // offset letters past the actual board frame.
    const scaleX = hostBounds.width / Math.max(1, this.rendererHost.clientWidth);
    const scaleY = hostBounds.height / Math.max(1, this.rendererHost.clientHeight);
    this.frontLetterLayer.style.inset = "auto";
    this.frontLetterLayer.style.left = `${(hostBounds.left - overlayBounds.left) / scaleX - this.frontLetterHost.clientLeft}px`;
    this.frontLetterLayer.style.top = `${(hostBounds.top - overlayBounds.top) / scaleY - this.frontLetterHost.clientTop}px`;
    this.frontLetterLayer.style.width = `${hostBounds.width / scaleX}px`;
    this.frontLetterLayer.style.height = `${hostBounds.height / scaleY}px`;
  }

  private drawDangerLine(): void {
    const dangerLineY = this.height * this.config.dangerLineRatio;
    this.dangerLine.clear();
    this.dangerLine
      .rect(0, dangerLineY - 3, this.width, 9)
      .fill({ color: 0xf0ba55, alpha: 0.08 });
    for (let x = 0; x < this.width; x += 22) {
      this.dangerLine.rect(x, dangerLineY, 13, 3);
    }
    this.dangerLine.fill({ color: 0xf0ba55, alpha: 0.78 });
  }

  private drawBoardScenery(): void {
    const { width, height } = this;
    const horizon = height * .69;
    this.boardScenery.clear();
    if (!this.config.showScenery) return;
    this.boardScenery.rect(0, 0, width, horizon).fill({ color: 0xdff1ff, alpha: 1 });
    this.boardScenery.rect(0, horizon, width, height * .18).fill({ color: 0xc9e59d, alpha: 1 });
    this.boardScenery.rect(0, height * .87, width, height * .13).fill({ color: 0xa9cd7c, alpha: 1 });
    this.boardScenery.ellipse(width * .54, height * 1.05, width * .62, height * .25).fill({ color: 0xb8d98c, alpha: 1 });
    this.boardScenery.ellipse(width * .08, height * 1.04, width * .43, height * .17).fill({ color: 0xc8e59d, alpha: 1 });
    this.drawCloud(width * .17, height * .18, 1);
    this.drawCloud(width * .65, height * .36, .72);
    this.drawCloud(width * .31, height * .51, .54);
    this.boardScenery.circle(width * .82, height * .16, Math.min(width, height) * .055).fill({ color: 0xffe56c, alpha: .58 });
    this.boardScenery.circle(width * .82, height * .16, Math.min(width, height) * .076).stroke({ color: 0xfff4b4, width: Math.max(2, Math.min(width, height) * .012), alpha: .24 });
  }
  private drawCloud(x: number, y: number, scale: number): void {
    const unit = Math.max(10, Math.min(this.width, this.height) * .035) * scale;
    this.boardScenery.rect(x - unit * 1.3, y, unit * 2.8, unit * .74).fill({ color: 0xffffff, alpha: .76 });
    this.boardScenery.circle(x - unit * .55, y, unit * .78).fill({ color: 0xffffff, alpha: .76 });
    this.boardScenery.circle(x + unit * .18, y - unit * .26, unit).fill({ color: 0xffffff, alpha: .76 });
    this.boardScenery.circle(x + unit * .85, y + unit * .05, unit * .7).fill({ color: 0xffffff, alpha: .76 });
  }
  private drawBoardGrid(): void {
    this.boardGrid.clear();
  }

  private drawGridCloud(x: number, y: number, scale: number): void {
    const unit = Math.max(10, Math.min(this.width, this.height) * .035) * scale;
    this.boardGrid.rect(x - unit * 1.3, y, unit * 2.8, unit * .74).fill({ color: 0xffffff, alpha: .8 });
    this.boardGrid.circle(x - unit * .55, y, unit * .78).fill({ color: 0xffffff, alpha: .8 });
    this.boardGrid.circle(x + unit * .18, y - unit * .26, unit).fill({ color: 0xffffff, alpha: .8 });
    this.boardGrid.circle(x + unit * .85, y + unit * .05, unit * .7).fill({ color: 0xffffff, alpha: .8 });
  }
  private assertActive(): void {
    if (this.destroyed) {
      throw new Error("PixiGameRenderer has already been destroyed.");
    }
  }

  private assertSize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new RangeError("Renderer dimensions must be finite positive numbers.");
    }
  }
}
