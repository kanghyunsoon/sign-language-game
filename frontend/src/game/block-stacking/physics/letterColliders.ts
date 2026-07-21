export type LetterColliderPart =
  | {
      readonly kind: "STROKE";
      readonly x: number;
      readonly y: number;
      readonly length: number;
      readonly axis: "HORIZONTAL" | "VERTICAL";
      readonly angle?: number;
    }
  | {
      readonly kind: "CIRCLE";
      readonly x: number;
      readonly y: number;
      readonly radius: number;
    }
  | {
      readonly kind: "POLYGON";
      readonly x: number;
      readonly y: number;
      readonly sides: number;
      readonly radius: number;
      readonly angle?: number;
    }
  | {
      readonly kind: "ENVELOPE";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };

const horizontal = (x: number, y: number, length: number): LetterColliderPart => ({ kind: "STROKE", x, y, length, axis: "HORIZONTAL" });
const vertical = (x: number, y: number, length: number): LetterColliderPart => ({ kind: "STROKE", x, y, length, axis: "VERTICAL" });
const diagonal = (x: number, y: number, length: number, angle: number): LetterColliderPart => ({ kind: "STROKE", x, y, length, axis: "VERTICAL", angle });
const circle = (x: number, y: number, radius: number): LetterColliderPart => ({ kind: "CIRCLE", x, y, radius });
const polygon = (x: number, y: number, sides: number, radius: number, angle = 0): LetterColliderPart => ({ kind: "POLYGON", x, y, sides, radius, angle });
const envelope = (x: number, y: number, width: number, height: number): LetterColliderPart => ({ kind: "ENVELOPE", x, y, width, height });

/**
 * Normalized stroke colliders. Positions and lengths are relative to a letter body.
 * A compound body preserves gaps between strokes, unlike a single enclosing rectangle.
 */
export const LETTER_COLLIDERS: Readonly<Record<string, readonly LetterColliderPart[]>> = {
  "ㄱ": [envelope(0, 0, 0.58, 0.58)], "ㄴ": [envelope(0, 0, 0.58, 0.58)],
  "ㄷ": [envelope(0, 0, 0.78, 0.74)], "ㄹ": [envelope(0, 0, 0.78, 0.78)],
  "ㅁ": [envelope(0, 0, 0.74, 0.74)], "ㅂ": [envelope(0, 0, 0.78, 0.76)],
  "ㅅ": [envelope(0, 0, 0.52, 0.56)], "ㅇ": [envelope(0, 0, 0.68, 0.68)],
  "ㅈ": [envelope(0, 0, 0.72, 0.72)], "ㅊ": [envelope(0, 0, 0.72, 0.78)],
  "ㅋ": [envelope(0, 0, 0.76, 0.72)], "ㅌ": [envelope(0, 0, 0.78, 0.74)],
  "ㅍ": [envelope(0, 0, 0.78, 0.66)], "ㅎ": [envelope(0, 0, 0.72, 0.78)],
  "ㅏ": [envelope(0, 0, 0.58, 0.70)], "ㅑ": [envelope(0, 0, 0.62, 0.70)],
  "ㅓ": [envelope(0, 0, 0.50, 0.70)], "ㅕ": [envelope(0, 0, 0.56, 0.70)],
  "ㅗ": [envelope(0, 0, 0.82, 0.62)], "ㅛ": [envelope(0, 0, 0.82, 0.68)],
  "ㅜ": [envelope(0, 0, 0.82, 0.62)], "ㅠ": [envelope(0, 0, 0.82, 0.68)],
  "ㅡ": [envelope(0, 0, 0.86, 0.36)], "ㅣ": [envelope(0, 0, 0.36, 0.86)],
  // Compound vowels and digits use individually sized tight envelopes instead
  // of the full letter cell. This prevents their invisible body from floating.
  "ㅐ": [envelope(0, 0, 0.72, 0.82)],
  "ㅒ": [envelope(0, 0, 0.78, 0.82)],
  "ㅔ": [envelope(0, 0, 0.72, 0.82)],
  "ㅖ": [envelope(0, 0, 0.78, 0.82)],
  "ㅢ": [envelope(0, 0, 0.78, 0.82)],
  "ㅚ": [envelope(0, 0, 0.72, 0.82)],
  "ㅟ": [envelope(0, 0, 0.64, 0.78)],
  "0": [envelope(0, 0, 0.68, 0.78)],
  "1": [envelope(0, 0, 0.36, 0.78)],
  "2": [envelope(0, 0, 0.62, 0.78)],
  "3": [envelope(0, 0, 0.62, 0.78)],
  "4": [envelope(0, 0, 0.66, 0.78)],
  "5": [envelope(0, 0, 0.62, 0.78)],
  "6": [envelope(0, 0, 0.64, 0.78)],
  "7": [envelope(0, 0, 0.62, 0.78)],
  "8": [envelope(0, 0, 0.66, 0.78)],
  "9": [envelope(0, 0, 0.64, 0.78)],
} as const;

/** Every current game symbol uses one convex envelope for predictable stacking. */
export function getLetterColliderEnvelope(symbol: string): { readonly width: number; readonly height: number } {
  const part = LETTER_COLLIDERS[symbol]?.[0];
  if (part?.kind === "ENVELOPE") return { width: part.width, height: part.height };
  return { width: 0.7, height: 0.7 };
}
