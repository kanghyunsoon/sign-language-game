import { Container, Sprite, Texture } from "pixi.js";

import {
  GLYPH_DISPLAY_FONT_RATIO,
  GLYPH_SOURCE_FONT_SIZE,
  createGlyphRaster,
} from "../glyphs/glyphRaster";

export interface LetterView {
  readonly root: Container;
  readonly id: string;
  setMotionState(velocityY: number, settled: boolean): void;
  setSpawnProgress(progress: number | null): void;
  setVisible(visible: boolean): void;
  setRemovalHighlighted(highlighted: boolean): void;
  setTargetHighlighted(highlighted: boolean): void;
  destroy(): void;
}

export interface LetterViewOptions {
  readonly id: string;
  readonly symbol: string;
  readonly width: number;
  readonly height: number;
}

const BASE_COLOR = 0x416d72;
const HIGHLIGHT_COLOR = 0xf4c95d;
const TARGET_COLOR = 0xd95b7d;
const SHADOW_COLOR = 0x365a60;
// Warm gold remains highly visible against the sky/grass board without
// reading as an unrelated "green" letter after the paper release.
const SPAWN_LAUNCH_COLOR = 0xf2a642;

export class LetterViewFactory {
  private readonly textures = new Map<string, Texture>();

  constructor(private readonly palette: {
    readonly baseColor?: number;
    readonly targetColor?: number;
    readonly shadowColor?: number;
  } = {}) {}

  create(options: LetterViewOptions): LetterView {
    const root = new Container();
    let removalHighlighted = false;
    let targetHighlighted = false;
    let motionScaleX = 1;
    let motionScaleY = 1;
    let spawnProgress: number | null = null;
    let texture = this.textures.get(options.symbol);
    if (!texture) {
      const raster = createGlyphRaster(options.symbol);
      texture = Texture.from(raster.canvas);
      this.textures.set(options.symbol, texture);
    }

    const content = new Container();
    const shadow = new Sprite(texture);
    shadow.anchor.set(0.5);
    shadow.tint = this.palette.shadowColor ?? SHADOW_COLOR;
    shadow.alpha = 0.18;
    shadow.position.set(0, 5);
    const outerEdge = new Sprite(texture);
    outerEdge.anchor.set(0.5);
    outerEdge.tint = 0x5b3f45;
    outerEdge.alpha = 1;
    const stickerEdge = new Sprite(texture);
    stickerEdge.anchor.set(0.5);
    stickerEdge.tint = 0xffffff;
    stickerEdge.alpha = 0.82;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.tint = this.palette.baseColor ?? BASE_COLOR;
    const displayFontSize = Math.min(options.width, options.height) * GLYPH_DISPLAY_FONT_RATIO;
    const scale = displayFontSize / GLYPH_SOURCE_FONT_SIZE;
    shadow.scale.set(scale * 1.08);
    outerEdge.scale.set(scale * 1.115);
    stickerEdge.scale.set(scale * 1.065);
    sprite.scale.set(scale);

    const targetGlow = new Sprite(texture);
    targetGlow.anchor.set(0.5);
    targetGlow.scale.set(scale * 1.09);
    targetGlow.tint = this.palette.targetColor ?? TARGET_COLOR;
    targetGlow.alpha = 0.78;
    targetGlow.blendMode = "add";
    targetGlow.visible = false;

    const targetHalo = new Sprite(texture);
    targetHalo.anchor.set(0.5);
    targetHalo.scale.set(scale * 1.17);
    targetHalo.tint = this.palette.targetColor ?? TARGET_COLOR;
    targetHalo.alpha = 0.4;
    targetHalo.blendMode = "add";
    targetHalo.visible = false;

    const targetEdge = new Sprite(texture);
    targetEdge.anchor.set(0.5);
    targetEdge.scale.set(scale * 1.035);
    targetEdge.tint = this.palette.targetColor ?? TARGET_COLOR;
    targetEdge.alpha = 0.95;
    targetEdge.blendMode = "add";
    targetEdge.visible = false;
    content.addChild(shadow, targetHalo, targetGlow, targetEdge, outerEdge, stickerEdge, sprite);
    root.addChild(content);

    const applyAppearance = () => {
      const progress = spawnProgress === null ? null : Math.max(0, Math.min(1, spawnProgress));
      // The growth happens on the paper before the body is released. Once it
      // starts falling it stays at its normal game-block size.
      content.scale.set(motionScaleX, motionScaleY);
      const tint = removalHighlighted
        ? HIGHLIGHT_COLOR
        : progress === null
          ? (targetHighlighted ? (this.palette.targetColor ?? TARGET_COLOR) : (this.palette.baseColor ?? BASE_COLOR))
          // The paper glyph finishes gold. Keep that colour at the handoff
          // instead of flashing back to pink on the first physics frame.
          : SPAWN_LAUNCH_COLOR;
      sprite.tint = tint;
      targetGlow.tint = tint;
      targetEdge.tint = tint;
      targetHalo.visible = targetHighlighted && progress === null;
      targetGlow.visible = targetHighlighted && progress === null;
      targetEdge.visible = targetHighlighted && progress === null;
    };

    return {
      root,
      id: options.id,
      setMotionState(velocityY: number, settled: boolean): void {
        const motion = settled ? 0 : Math.min(1, Math.abs(velocityY) / 4.5);
        motionScaleX = 1 - motion * 0.018;
        motionScaleY = 1 + motion * 0.032;
        applyAppearance();
        shadow.alpha = settled ? 0.22 : 0.14 + motion * 0.08;
      },
      setSpawnProgress(progress: number | null): void {
        spawnProgress = progress;
        applyAppearance();
      },
      setVisible(visible: boolean): void {
        root.visible = visible;
      },
      setRemovalHighlighted(highlighted: boolean): void {
        removalHighlighted = highlighted;
        applyAppearance();
      },
      setTargetHighlighted(highlighted: boolean): void {
        targetHighlighted = highlighted;
        applyAppearance();
      },
      destroy(): void {
        root.destroy({ children: true, texture: false, textureSource: false });
      },
    };
  }

  destroy(): void {
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
  }
}
