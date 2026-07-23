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

export class LetterViewFactory {
  private readonly textures = new Map<string, Texture>();

  create(options: LetterViewOptions): LetterView {
    const root = new Container();
    let removalHighlighted = false;
    let targetHighlighted = false;
    let texture = this.textures.get(options.symbol);
    if (!texture) {
      const raster = createGlyphRaster(options.symbol);
      texture = Texture.from(raster.canvas);
      this.textures.set(options.symbol, texture);
    }

    const content = new Container();
    const shadow = new Sprite(texture);
    shadow.anchor.set(0.5);
    shadow.tint = 0x365a60;
    shadow.alpha = 0.18;
    shadow.position.set(0, 5);
    const stickerEdge = new Sprite(texture);
    stickerEdge.anchor.set(0.5);
    stickerEdge.tint = 0xffffff;
    stickerEdge.alpha = 0.82;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.tint = BASE_COLOR;
    const displayFontSize = Math.min(options.width, options.height) * GLYPH_DISPLAY_FONT_RATIO;
    const scale = displayFontSize / GLYPH_SOURCE_FONT_SIZE;
    shadow.scale.set(scale * 1.08);
    stickerEdge.scale.set(scale * 1.045);
    sprite.scale.set(scale);

    const targetGlow = new Sprite(texture);
    targetGlow.anchor.set(0.5);
    targetGlow.scale.set(scale * 1.09);
    targetGlow.tint = TARGET_COLOR;
    targetGlow.alpha = 0.78;
    targetGlow.blendMode = "add";
    targetGlow.visible = false;

    const targetHalo = new Sprite(texture);
    targetHalo.anchor.set(0.5);
    targetHalo.scale.set(scale * 1.17);
    targetHalo.tint = TARGET_COLOR;
    targetHalo.alpha = 0.4;
    targetHalo.blendMode = "add";
    targetHalo.visible = false;

    const targetEdge = new Sprite(texture);
    targetEdge.anchor.set(0.5);
    targetEdge.scale.set(scale * 1.035);
    targetEdge.tint = TARGET_COLOR;
    targetEdge.alpha = 0.95;
    targetEdge.blendMode = "add";
    targetEdge.visible = false;
    content.addChild(shadow, targetHalo, targetGlow, targetEdge, stickerEdge, sprite);
    root.addChild(content);

    return {
      root,
      id: options.id,
      setMotionState(velocityY: number, settled: boolean): void {
        const motion = settled ? 0 : Math.min(1, Math.abs(velocityY) / 4.5);
        content.scale.set(1 - motion * 0.018, 1 + motion * 0.032);
        shadow.alpha = settled ? 0.22 : 0.14 + motion * 0.08;
      },
      setRemovalHighlighted(highlighted: boolean): void {
        removalHighlighted = highlighted;
        sprite.tint = removalHighlighted ? HIGHLIGHT_COLOR : targetHighlighted ? TARGET_COLOR : BASE_COLOR;
      },
      setTargetHighlighted(highlighted: boolean): void {
        targetHighlighted = highlighted;
        sprite.tint = removalHighlighted ? HIGHLIGHT_COLOR : targetHighlighted ? TARGET_COLOR : BASE_COLOR;
        targetHalo.visible = highlighted;
        targetGlow.visible = highlighted;
        targetEdge.visible = highlighted;
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
