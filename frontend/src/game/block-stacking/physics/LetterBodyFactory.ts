import { Bodies, Body } from "matter-js";

import {
  GLYPH_COLLIDER_GAP_PX,
  GLYPH_DISPLAY_FONT_RATIO,
  GLYPH_SOURCE_FONT_SIZE,
  getGlyphCollisionRects,
  getGlyphRasterMetrics,
  type GlyphCollisionRect,
} from "../glyphs/glyphRaster";
import { glyphStrokeTemplatesFor, type GlyphStrokeTemplate } from "./glyphStrokeTemplates";
import type { LetterBodySpec, PhysicsConfig } from "./types";

const COLLISION_SLOP_PX = 0.05;
export const MAX_RASTER_COLLIDER_PARTS = 8;

export interface LetterBodyMetadata {
  readonly id: string;
  readonly symbol: string;
}

export class LetterBodyFactory {
  constructor(private readonly config: PhysicsConfig) {}

  create(spec: LetterBodySpec): Body {
    const displayFontSize = Math.min(this.config.letterWidth, this.config.letterHeight) * GLYPH_DISPLAY_FONT_RATIO;
    const scale = displayFontSize / GLYPH_SOURCE_FONT_SIZE;
    const padding = GLYPH_COLLIDER_GAP_PX + this.config.letterColliderPadding;
    const collisionRects = getGlyphCollisionRects(spec.symbol);
    const strokes = glyphStrokeTemplatesFor(spec.symbol);
    const body = collisionRects.length > 0 && collisionRects.length <= MAX_RASTER_COLLIDER_PARTS
      ? this.createRasterCompoundBody(spec, collisionRects, scale, padding)
      : strokes && strokes.length > 0
        ? this.createTemplateCompoundBody(spec, strokes, scale, padding)
        : this.createFallbackRectangle(spec, scale, padding);

    Body.setInertia(body, body.inertia * this.config.rotationInertiaScale);
    if (spec.angle !== undefined) Body.setAngle(body, spec.angle);
    if (spec.angularVelocity !== undefined) Body.setAngularVelocity(body, spec.angularVelocity);
    return body;
  }

  private createRasterCompoundBody(
    spec: LetterBodySpec,
    rectangles: readonly GlyphCollisionRect[],
    scale: number,
    padding: number,
  ): Body {
    const bodyOptions = this.bodyOptions(spec);
    const parts = rectangles.map((rectangle) => Bodies.rectangle(
      spec.x + rectangle.x * scale,
      spec.y + rectangle.y * scale,
      rectangle.width * scale + padding * 2,
      rectangle.height * scale + padding * 2,
      bodyOptions,
    ));
    const body = Body.create({ ...bodyOptions, parts });

    Body.setCentre(body, { x: spec.x, y: spec.y });
    return body;
  }

  private createTemplateCompoundBody(
    spec: LetterBodySpec,
    strokes: readonly GlyphStrokeTemplate[],
    scale: number,
    padding: number,
  ): Body {
    const metrics = getGlyphRasterMetrics(spec.symbol);
    const glyphWidth = metrics.inkWidth * scale;
    const glyphHeight = metrics.inkHeight * scale;
    const bodyOptions = this.bodyOptions(spec);
    const parts = strokes.map((stroke) => Bodies.rectangle(
      spec.x + stroke.x * glyphWidth,
      spec.y + stroke.y * glyphHeight,
      stroke.width * glyphWidth + padding * 2,
      stroke.height * glyphHeight + padding * 2,
      { ...bodyOptions, angle: stroke.angle ?? 0 },
    ));
    const body = Body.create({ ...bodyOptions, parts });
    Body.setCentre(body, { x: spec.x, y: spec.y });
    return body;
  }

  private createFallbackRectangle(spec: LetterBodySpec, scale: number, padding: number): Body {
    const metrics = getGlyphRasterMetrics(spec.symbol);
    return Bodies.rectangle(
      spec.x,
      spec.y,
      metrics.inkWidth * scale + padding * 2,
      metrics.inkHeight * scale + padding * 2,
      this.bodyOptions(spec),
    );
  }

  private bodyOptions(spec: LetterBodySpec) {
    return {
      friction: this.config.friction,
      frictionAir: this.config.frictionAir,
      restitution: this.config.restitution,
      density: this.config.density,
      slop: COLLISION_SLOP_PX,
      label: `letter:${spec.id}`,
    };
  }
}
