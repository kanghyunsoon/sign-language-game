import { Container, Sprite, Texture } from "pixi.js";

import {
  GLYPH_DISPLAY_FONT_RATIO,
  GLYPH_SOURCE_FONT_SIZE,
  createGlyphRaster,
} from "../glyphs/glyphRaster";

export interface LetterView {
  readonly root: Container;
  readonly id: string;
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

const HIGHLIGHT_COLOR = 0xffd166;
const TARGET_COLOR = 0xff1744;

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

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    const displayFontSize = Math.min(options.width, options.height) * GLYPH_DISPLAY_FONT_RATIO;
    const scale = displayFontSize / GLYPH_SOURCE_FONT_SIZE;
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
    root.addChild(targetHalo, targetGlow, targetEdge, sprite);

    return {
      root,
      id: options.id,
      setRemovalHighlighted(highlighted: boolean): void {
        removalHighlighted = highlighted;
        sprite.tint = removalHighlighted ? HIGHLIGHT_COLOR : targetHighlighted ? TARGET_COLOR : 0xffffff;
      },
      setTargetHighlighted(highlighted: boolean): void {
        targetHighlighted = highlighted;
        sprite.tint = removalHighlighted ? HIGHLIGHT_COLOR : targetHighlighted ? TARGET_COLOR : 0xffffff;
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
