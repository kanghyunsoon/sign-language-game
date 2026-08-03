import glyphCollisionDefaults from "./glyphCollisionDefaults.json";

export interface GlyphRasterMetrics {
  readonly inkWidth: number;
  readonly inkHeight: number;
  readonly widthRatio: number;
  readonly heightRatio: number;
}

export interface GlyphRaster extends GlyphRasterMetrics {
  readonly canvas: HTMLCanvasElement;
}

export interface GlyphCollisionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Rectangle rotation in radians around its own center. */
  readonly angle?: number;
}

export interface GlyphCollisionTuning {
  /** Horizontal shift in source-font pixels. */
  readonly offsetX?: number;
  /** Vertical shift in source-font pixels. */
  readonly offsetY?: number;
  /** Width multiplier around each collision rectangle's center. */
  readonly scaleX?: number;
  /** Height multiplier around each collision rectangle's center. */
  readonly scaleY?: number;
}

const GLYPH_COLLISION_DEFAULTS:
Readonly<Partial<Record<string, readonly GlyphCollisionRect[]>>> = glyphCollisionDefaults;

/**
 * Optional per-glyph fine tuning. Edit only the glyph that needs adjustment;
 * Vite hot reload applies the change immediately in `?collisionAudit=1`.
 */
export const GLYPH_COLLISION_TUNING: Readonly<Partial<Record<string, GlyphCollisionTuning>>> = {
  // "ㅢ": { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
  // "ㅟ": { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
};

export const GLYPH_COLLIDER_GAP_PX = 0;
export const GLYPH_SOURCE_FONT_SIZE = 200;
export const GLYPH_DISPLAY_FONT_RATIO = 1;
export const GAME_GLYPH_FILL_COLOR = "#f4fbff";
export const GAME_GLYPH_STROKE_COLOR = "#5b432f";
export const GAME_GLYPH_STROKE_WIDTH = 10;
const HORIZONTAL_VOWEL_STROKE_WIDTH = 18;

const FONT_SIZE = GLYPH_SOURCE_FONT_SIZE;
/**
 * Falling glyphs use the original Noto Sans KR face. Its measurement and
 * artwork share one font, keeping every visible outline aligned with the
 * established physics collision dimensions.
 */
const COLLISION_REFERENCE_FONT = `700 ${FONT_SIZE}px "Noto Sans KR", "Malgun Gothic", sans-serif`;
export const GAME_GLYPH_FONT_FAMILY = "Noto Sans KR";
const DISPLAY_FONT = `700 ${FONT_SIZE}px "${GAME_GLYPH_FONT_FAMILY}", "Malgun Gothic", sans-serif`;
const RASTER_PADDING = 4;
const COLLISION_CELL_SIZE = 8;
const COLLISION_ALPHA_THRESHOLD = 0.025;
const COLLISION_OVERRIDE_STORAGE_KEY = "sudal:glyph-collision-overrides:v1";
const metricsCache = new Map<string, GlyphRasterMetrics>();
const collisionRectsCache = new Map<string, readonly GlyphCollisionRect[]>();

declare global {
  interface Window {
    __auditGlyphColliders?: (symbols: readonly string[]) => readonly {
      readonly symbol: string;
      readonly parts: number;
      readonly rectangles: readonly GlyphCollisionRect[];
    }[];
  }
}

export async function prepareGameGlyphFont(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await document.fonts.load(`700 ${FONT_SIZE}px "${GAME_GLYPH_FONT_FAMILY}"`);
  } catch {
    // The fallback font still keeps the game playable when the webfont cannot
    // be fetched (for example, in an offline classroom environment).
  }
}

export async function primeGlyphCollisionCache(symbols: readonly string[]): Promise<void> {
  if (typeof document === "undefined") return;
  const uncached = [...new Set(symbols)].filter((symbol) => !collisionRectsCache.has(symbol));
  const chunkSize = 4;
  for (let index = 0; index < uncached.length; index += chunkSize) {
    await waitForBrowserIdle();
    for (const symbol of uncached.slice(index, index + chunkSize)) getGlyphCollisionRects(symbol);
  }
}

export function getGlyphRasterMetrics(symbol: string): GlyphRasterMetrics {
  const cached = metricsCache.get(symbol);
  if (cached) return cached;
  if (typeof document === "undefined") return fallbackMetrics(symbol);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return fallbackMetrics(symbol);
  context.font = COLLISION_REFERENCE_FONT;
  const measured = context.measureText(symbol);
  const inkWidth = Math.max(1, Math.ceil(measured.actualBoundingBoxLeft + measured.actualBoundingBoxRight));
  const inkHeight = Math.max(1, Math.ceil(measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent));
  const maximum = Math.max(inkWidth, inkHeight);
  const metrics = { inkWidth, inkHeight, widthRatio: inkWidth / maximum, heightRatio: inkHeight / maximum };
  metricsCache.set(symbol, metrics);
  return metrics;
}

export function createGlyphRaster(symbol: string): GlyphRaster {
  if (typeof document === "undefined") throw new Error("Glyph rasterization requires a browser document");
  const metrics = getGlyphRasterMetrics(symbol);
  const canvas = document.createElement("canvas");
  canvas.width = metrics.inkWidth + RASTER_PADDING * 2;
  canvas.height = metrics.inkHeight + RASTER_PADDING * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a glyph canvas context");

  // Rasterize the friendly display face separately, then fit it into the
  // original collision ink box. This changes only the artwork: physics body
  // size, tuned collision rectangles, and solo/battle board scale stay exact.
  const source = document.createElement("canvas");
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("Could not create a glyph source context");
  sourceContext.font = DISPLAY_FONT;
  const displayMetrics = sourceContext.measureText(symbol);
  const displayWidth = Math.max(1, Math.ceil(
    displayMetrics.actualBoundingBoxLeft + displayMetrics.actualBoundingBoxRight,
  ));
  const displayHeight = Math.max(1, Math.ceil(
    displayMetrics.actualBoundingBoxAscent + displayMetrics.actualBoundingBoxDescent,
  ));
  // Leave enough source-space for the outline before the artwork is scaled
  // back into the existing collision box. Physics stays unchanged, while
  // adjacent glyphs remain visually separable when a tower gets crowded.
  const displayPadding = RASTER_PADDING + 8;
  source.width = displayWidth + displayPadding * 2;
  source.height = displayHeight + displayPadding * 2;
  const drawingContext = source.getContext("2d");
  if (!drawingContext) throw new Error("Could not resize the glyph source context");
  drawingContext.font = DISPLAY_FONT;
  drawingContext.fillStyle = GAME_GLYPH_FILL_COLOR;
  drawingContext.strokeStyle = GAME_GLYPH_STROKE_COLOR;
  drawingContext.lineJoin = "round";
  // The horizontal vowel occupies very little vertical ink area. A stronger
  // outline keeps it legible beside the taller consonants without changing
  // its tuned Matter.js collision shape.
  drawingContext.lineWidth = symbol === "ㅡ" ? HORIZONTAL_VOWEL_STROKE_WIDTH : GAME_GLYPH_STROKE_WIDTH;
  drawingContext.textAlign = "left";
  drawingContext.textBaseline = "alphabetic";
  const drawX = displayPadding + displayMetrics.actualBoundingBoxLeft;
  const drawY = displayPadding + displayMetrics.actualBoundingBoxAscent;
  drawingContext.strokeText(symbol, drawX, drawY);
  drawingContext.fillText(symbol, drawX, drawY);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    0,
    0,
    source.width,
    source.height,
    RASTER_PADDING,
    RASTER_PADDING,
    metrics.inkWidth,
    metrics.inkHeight,
  );
  return { ...metrics, canvas };
}

/**
 * Converts a glyph's visible strokes into a small set of rectangles for a
 * compound physics body. The returned coordinates are relative to the
 * texture center, matching the Pixi sprite anchor.
 */
export function getGlyphCollisionRects(symbol: string): readonly GlyphCollisionRect[] {
  const browserOverride = shouldUseBrowserCollisionOverrides()
    ? readBrowserCollisionOverrides()[symbol]
    : undefined;
  if (browserOverride) return browserOverride;
  const projectDefault = GLYPH_COLLISION_DEFAULTS[symbol];
  if (projectDefault) return tuneCollisionRects(symbol, projectDefault);
  const cached = collisionRectsCache.get(symbol);
  if (cached) return cached;
  if (typeof document === "undefined") return [];

  const raster = createGlyphRaster(symbol);
  const context = raster.canvas.getContext("2d");
  if (!context) return [];
  const image = context.getImageData(0, 0, raster.canvas.width, raster.canvas.height);
  const columns = Math.ceil(raster.canvas.width / COLLISION_CELL_SIZE);
  const rows = Math.ceil(raster.canvas.height / COLLISION_CELL_SIZE);
  const occupied = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => (
    alphaCoverage(image.data, raster.canvas.width, raster.canvas.height, column, row) >= COLLISION_ALPHA_THRESHOLD
  )));
  const cells = mergeOccupiedGlyphCells(occupied);
  const rectangles = tuneCollisionRects(symbol, cells.map((cell) => ({
    x: cell.x * COLLISION_CELL_SIZE + cell.width * COLLISION_CELL_SIZE / 2 - raster.canvas.width / 2,
    y: cell.y * COLLISION_CELL_SIZE + cell.height * COLLISION_CELL_SIZE / 2 - raster.canvas.height / 2,
    width: Math.min(cell.width * COLLISION_CELL_SIZE, raster.canvas.width - cell.x * COLLISION_CELL_SIZE),
    height: Math.min(cell.height * COLLISION_CELL_SIZE, raster.canvas.height - cell.y * COLLISION_CELL_SIZE),
  })));
  collisionRectsCache.set(symbol, rectangles);
  return rectangles;
}

function shouldUseBrowserCollisionOverrides(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("collisionAudit") === "1";
}

/** Saves a development-only collider override edited in the browser audit UI. */
export function setGlyphCollisionOverride(
  symbol: string,
  rectangles: readonly GlyphCollisionRect[] | null,
): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  const overrides = readBrowserCollisionOverrides();
  if (rectangles === null) delete overrides[symbol];
  else overrides[symbol] = rectangles.map((rectangle) => ({ ...rectangle }));
  window.localStorage.setItem(COLLISION_OVERRIDE_STORAGE_KEY, JSON.stringify(overrides));
  collisionRectsCache.delete(symbol);
}

export function getGlyphCollisionOverrides(): Readonly<Record<string, readonly GlyphCollisionRect[]>> {
  return readBrowserCollisionOverrides();
}

function readBrowserCollisionOverrides(): Record<string, GlyphCollisionRect[]> {
  if (!import.meta.env.DEV || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(COLLISION_OVERRIDE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, GlyphCollisionRect[]>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function tuneCollisionRects(
  symbol: string,
  rectangles: readonly GlyphCollisionRect[],
): readonly GlyphCollisionRect[] {
  const tuning = GLYPH_COLLISION_TUNING[symbol];
  if (!tuning) return rectangles;
  const offsetX = tuning.offsetX ?? 0;
  const offsetY = tuning.offsetY ?? 0;
  const scaleX = tuning.scaleX ?? 1;
  const scaleY = tuning.scaleY ?? 1;
  return rectangles.map((rectangle) => ({
    x: rectangle.x + offsetX,
    y: rectangle.y + offsetY,
    width: rectangle.width * scaleX,
    height: rectangle.height * scaleY,
  }));
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__auditGlyphColliders = (symbols) => symbols.map((symbol) => ({
    symbol,
    parts: getGlyphCollisionRects(symbol).length,
    rectangles: getGlyphCollisionRects(symbol),
  }));
}

export interface OccupiedGlyphCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Greedily merges adjacent opaque raster cells into compound-body parts. */
export function mergeOccupiedGlyphCells(occupied: readonly (readonly boolean[])[]): readonly OccupiedGlyphCell[] {
  const rows = occupied.length;
  const columns = occupied[0]?.length ?? 0;
  if (occupied.some((row) => row.length !== columns)) throw new Error("Glyph occupancy rows must have equal length.");
  const remaining = occupied.map((row) => [...row]);
  const rectangles: OccupiedGlyphCell[] = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      if (!remaining[y]?.[x]) continue;
      let width = 0;
      while (x + width < columns && remaining[y]?.[x + width]) width += 1;
      let height = 1;
      while (y + height < rows && everyOccupied(remaining[y + height]!, x, width)) height += 1;
      for (let clearY = y; clearY < y + height; clearY += 1) {
        for (let clearX = x; clearX < x + width; clearX += 1) remaining[clearY]![clearX] = false;
      }
      rectangles.push({ x, y, width, height });
    }
  }
  return rectangles;
}

function alphaCoverage(
  pixels: Uint8ClampedArray,
  canvasWidth: number,
  canvasHeight: number,
  column: number,
  row: number,
): number {
  const startX = column * COLLISION_CELL_SIZE;
  const startY = row * COLLISION_CELL_SIZE;
  const endX = Math.min(startX + COLLISION_CELL_SIZE, canvasWidth);
  const endY = Math.min(startY + COLLISION_CELL_SIZE, canvasHeight);
  let alpha = 0;
  let samples = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      alpha += pixels[(y * canvasWidth + x) * 4 + 3] ?? 0;
      samples += 1;
    }
  }
  return samples === 0 ? 0 : alpha / (samples * 255);
}

function everyOccupied(row: readonly boolean[], start: number, width: number): boolean {
  for (let column = start; column < start + width; column += 1) {
    if (!row[column]) return false;
  }
  return true;
}

function fallbackMetrics(symbol: string): GlyphRasterMetrics {
  const narrow = new Set(["ㅣ", "1"]);
  const horizontal = new Set(["ㅡ"]);
  const widthRatio = narrow.has(symbol) ? 0.35 : 0.78;
  const heightRatio = horizontal.has(symbol) ? 0.35 : 1;
  return { inkWidth: widthRatio * FONT_SIZE, inkHeight: heightRatio * FONT_SIZE, widthRatio, heightRatio };
}

function waitForBrowserIdle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestIdleCallback === "function") {
      globalThis.requestIdleCallback(() => resolve(), { timeout: 100 });
      return;
    }
    globalThis.setTimeout(resolve, 0);
  });
}
