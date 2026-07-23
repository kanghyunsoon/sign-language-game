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

export class PixiGameRenderer implements GameRenderer {
  private readonly lettersLayer = new Container();
  private readonly overlayLayer = new Container();
  private readonly boardGrid = new Graphics();
  private readonly dangerLine = new Graphics();
  private readonly views = new Map<string, LetterView>();
  private readonly removalEffects = new Map<string, { readonly effect: RemovalEffect; readonly burst: RemovalBurst }>();
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
    this.app.stage.addChild(this.boardGrid, this.lettersLayer, this.overlayLayer);
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
      backgroundColor: 0x294b5d,
      backgroundAlpha: 0,
      antialias: false,
      preference: "webgl",
      resolution: 1,
      autoDensity: true,
    });

    mount.replaceChildren(app.canvas);
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
    }

    for (const [id, view] of this.views) {
      if (!activeIds.has(id)) {
        view.destroy();
        this.views.delete(id);
        this.removalEffects.get(id)?.burst.destroy();
        this.removalEffects.delete(id);
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

  private drawBoardGrid(): void {
    const cell = Math.max(42, Math.min(56, Math.round(Math.min(this.width, this.height) / 10)));
    this.boardGrid.clear();
    for (let x = cell; x < this.width; x += cell) this.boardGrid.moveTo(x, 0).lineTo(x, this.height);
    for (let y = cell; y < this.height; y += cell) this.boardGrid.moveTo(0, y).lineTo(this.width, y);
    this.boardGrid.stroke({ color: 0xffffff, width: 1, alpha: .12 });
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
