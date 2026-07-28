import { Application, Container, Graphics } from "pixi.js";

import { prepareGameGlyphFont } from "../glyphs/glyphRaster";
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
  private readonly viewFactory = new LetterViewFactory();
  private targetId: string | null = null;
  private width: number;
  private height: number;
  private destroyed = false;

  private constructor(
    private readonly app: Application,
    private readonly config: RendererConfig,
  ) {
    this.width = config.width;
    this.height = config.height;
    this.overlayLayer.addChild(this.dangerLine);
    this.app.stage.addChild(this.boardScenery, this.boardGrid, this.lettersLayer, this.overlayLayer);
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
    // Render the complete solo-style scenery inside the game canvas.
    app.renderer.background.alpha = 1;
    const renderer = new PixiGameRenderer(app, resolvedConfig);
    app.stop();
    return renderer;
  }

  resize(width: number, height: number): void {
    this.assertActive();
    this.assertSize(width, height);
    this.width = width;
    this.height = height;
    this.app.renderer.resize(width, height);
    this.drawBoardScenery();
    this.drawBoardGrid();
    this.drawDangerLine();
    this.app.render();
  }

  render(letters: readonly PhysicsLetterState[]): void {
    this.assertActive();
    const activeIds = new Set<string>();

    for (const letter of letters) {
      activeIds.add(letter.id);
      const view = this.getOrCreateView(letter);
      if (
        Math.abs(view.root.x - letter.x) >= POSITION_RENDER_EPSILON
        || Math.abs(view.root.y - letter.y) >= POSITION_RENDER_EPSILON
      ) {
        view.root.position.set(letter.x, letter.y);
      }
      if (Math.abs(view.root.rotation - letter.angle) >= ROTATION_RENDER_EPSILON) {
        view.root.rotation = letter.angle;
      }
      view.setMotionState(letter.velocityY, letter.settled);
      const spawnElapsedMs = this.spawnEffects.get(letter.id);
      view.setSpawnProgress(spawnElapsedMs === undefined ? null : Math.min(1, spawnElapsedMs / SPAWN_EFFECT_DURATION_MS));
    }

    for (const [id, view] of this.views) {
      if (!activeIds.has(id)) {
        view.destroy();
        this.views.delete(id);
        this.removalEffects.get(id)?.burst.destroy();
        this.removalEffects.delete(id);
        this.spawnEffects.delete(id);
      }
    }
    this.app.render();
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
    this.targetId = null;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }

    this.clear();
    this.viewFactory.destroy();
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
    const cell = Math.max(42, Math.min(56, Math.round(Math.min(this.width, this.height) / 10)));
    this.boardGrid.clear();
    for (let x = cell; x < this.width; x += cell) this.boardGrid.moveTo(x, 0).lineTo(x, this.height);
    for (let y = cell; y < this.height; y += cell) this.boardGrid.moveTo(0, y).lineTo(this.width, y);
    this.boardGrid.stroke({ color: 0xffffff, width: 1, alpha: .62 });
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
