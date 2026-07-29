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
