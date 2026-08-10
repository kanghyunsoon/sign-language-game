export interface GlyphStrokeTemplate {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle?: number;
}

const H = (x: number, y: number, width = 0.82): GlyphStrokeTemplate => ({ x, y, width, height: 0.15 });
const V = (x: number, y: number, height = 0.82): GlyphStrokeTemplate => ({ x, y, width: 0.15, height });
const D = (x: number, y: number, angle: number, length = 0.78): GlyphStrokeTemplate => ({ x, y, width: length, height: 0.15, angle });
const RING = (): readonly GlyphStrokeTemplate[] => [H(0, -0.36, 0.46), H(0, 0.36, 0.46), V(-0.36, 0, 0.46), V(0.36, 0, 0.46)];

/** A small number of long rectangles, one for each visible glyph stroke. */
export const GLYPH_STROKE_TEMPLATES: Readonly<Record<string, readonly GlyphStrokeTemplate[]>> = {
  "\u3131": [H(0, -0.38), V(-0.38, 0)],
  "\u3134": [V(-0.38, 0), H(0, 0.38)],
  "\u3137": [H(0, -0.38), V(-0.38, 0), H(0, 0.38)],
  "\u3139": [H(0, -0.38), V(-0.38, -0.18, 0.42), H(0, 0, 0.72), V(0.38, 0.18, 0.42), H(0, 0.38)],
  "\u3141": [H(0, -0.38), H(0, 0.38), V(-0.38, 0), V(0.38, 0)],
  "\u3142": [H(0, -0.38), H(0, 0), H(0, 0.38), V(-0.38, 0), V(0.38, 0)],
  "\u3145": [D(-0.2, 0, Math.PI / 3), D(0.2, 0, -Math.PI / 3)],
  "\u3147": RING(),
  "\u3148": [H(0, -0.32), D(-0.2, 0.12, Math.PI / 3), D(0.2, 0.12, -Math.PI / 3)],
  "\u314A": [V(0, -0.38, 0.2), H(0, -0.2), D(-0.2, 0.14, Math.PI / 3), D(0.2, 0.14, -Math.PI / 3)],
  "\u314B": [V(-0.38, 0), H(0.06, -0.24, 0.64), H(0.06, 0.24, 0.64)],
  "\u314C": [H(0, -0.38), H(0, 0), H(0, 0.38), V(-0.38, 0)],
  "\u314D": [V(-0.38, 0), V(0.38, 0), H(0, -0.2), H(0, 0.2)],
  "\u314E": [...RING(), H(0, -0.46, 0.36), H(0, 0.46, 0.36)],
  "\u314F": [V(-0.18, 0), H(0.18, 0, 0.54)],
  "\u3151": [V(-0.18, 0), H(0.18, -0.22, 0.54), H(0.18, 0.22, 0.54)],
  "\u3153": [V(0.18, 0), H(-0.18, 0, 0.54)],
  "\u3155": [V(0.18, 0), H(-0.18, -0.22, 0.54), H(-0.18, 0.22, 0.54)],
  "\u3157": [H(0, 0.2), V(0, -0.18, 0.5)],
  "\u315B": [H(0, 0.22), V(-0.2, -0.18, 0.5), V(0.2, -0.18, 0.5)],
  "\u315C": [H(0, -0.2), V(0, 0.18, 0.5)],
  "\u3160": [H(0, -0.22), V(-0.2, 0.18, 0.5), V(0.2, 0.18, 0.5)],
  "\u3161": [H(0, 0)],
  "\u3163": [V(0, 0)],
  "\u3150": [V(-0.22, 0), V(0.22, 0), H(0.02, 0, 0.42)],
  "\u3152": [V(-0.22, 0), V(0.22, 0), H(0.02, -0.2, 0.42), H(0.02, 0.2, 0.42)],
  "\u3154": [V(0.22, 0), V(-0.22, 0), H(-0.02, 0, 0.42)],
  "\u3156": [V(0.22, 0), V(-0.22, 0), H(-0.02, -0.2, 0.42), H(-0.02, 0.2, 0.42)],
  // Compound vowels keep their separated strokes even when browser raster
  // colliders are unavailable. This prevents the blank area between the
  // component vowels from becoming one solid collision rectangle.
  "\u3162": [H(-0.2, 0.2, 0.56), V(0.34, 0, 0.82)],
  "\u315A": [H(-0.2, 0.22, 0.56), V(-0.2, -0.14, 0.46), V(0.34, 0, 0.82)],
  "\u315F": [H(-0.2, -0.22, 0.56), V(-0.2, 0.14, 0.46), V(0.34, 0, 0.82)],
};

export function glyphStrokeTemplatesFor(symbol: string): readonly GlyphStrokeTemplate[] | undefined {
  return GLYPH_STROKE_TEMPLATES[symbol];
}
