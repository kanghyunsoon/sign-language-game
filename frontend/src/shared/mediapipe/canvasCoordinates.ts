import type { NormalizedLandmark3D } from "./types";

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export function landmarkToCanvasPoint(
  landmark: NormalizedLandmark3D,
  width: number,
  height: number,
): CanvasPoint {
  return { x: landmark.x * width, y: landmark.y * height };
}

export type MediaObjectFit = "cover" | "contain" | "fill";

export interface SourceViewportBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * Returns the normalized portion of the camera source that is visible after
 * object-fit has been applied to the viewport.  This is deliberately shared
 * by rendering and recognition so a cropped-out hand can never be accepted
 * by the recognizer.
 */
export function visibleSourceBounds(
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  objectFit: MediaObjectFit,
): SourceViewportBounds {
  if (
    objectFit !== "cover" ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return { left: 0, top: 0, right: 1, bottom: 1 };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const viewportAspect = viewportWidth / viewportHeight;
  if (sourceAspect > viewportAspect) {
    const visibleWidth = viewportAspect / sourceAspect;
    const left = (1 - visibleWidth) / 2;
    return { left, top: 0, right: left + visibleWidth, bottom: 1 };
  }

  const visibleHeight = sourceAspect / viewportAspect;
  const top = (1 - visibleHeight) / 2;
  return { left: 0, top, right: 1, bottom: top + visibleHeight };
}

/**
 * Rejects hands that sit outside the portion of the source video actually
 * visible in the camera frame.  Requiring the palm anchors avoids accepting
 * a partly cropped hand whose landmarks would otherwise be rendered or
 * recognized beyond the visible camera viewport.  All 21 landmarks must be
 * visible: a fingertip cut by the crop boundary must behave exactly like a
 * hand outside the camera frame.
 */
export function isHandVisibleInViewport(
  landmarks: readonly Pick<NormalizedLandmark3D, "x" | "y">[],
  sourceWidth: number,
  sourceHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  objectFit: MediaObjectFit,
): boolean {
  if (landmarks.length === 0) return false;
  const bounds = visibleSourceBounds(sourceWidth, sourceHeight, viewportWidth, viewportHeight, objectFit);
  return landmarks.every((landmark) => {
    return landmark !== undefined
      && landmark.x >= bounds.left
      && landmark.x <= bounds.right
      && landmark.y >= bounds.top
      && landmark.y <= bounds.bottom;
  });
}

/**
 * Projects a normalized MediaPipe point into the part of a video that is
 * actually visible inside its viewport.
 */
export function landmarkToFittedCanvasPoint(
  landmark: NormalizedLandmark3D,
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  objectFit: MediaObjectFit,
): CanvasPoint {
  if (
    objectFit === "fill" ||
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    canvasWidth <= 0 ||
    canvasHeight <= 0
  ) {
    return landmarkToCanvasPoint(landmark, canvasWidth, canvasHeight);
  }

  const scale = objectFit === "contain"
    ? Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight)
    : Math.max(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (canvasWidth - renderedWidth) / 2;
  const offsetY = (canvasHeight - renderedHeight) / 2;

  return {
    x: offsetX + landmark.x * renderedWidth,
    y: offsetY + landmark.y * renderedHeight,
  };
}

export function mirrorCanvasPoint(point: CanvasPoint, width: number): CanvasPoint {
  return { x: width - point.x, y: point.y };
}
