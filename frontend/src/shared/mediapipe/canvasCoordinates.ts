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

export function mirrorCanvasPoint(point: CanvasPoint, width: number): CanvasPoint {
  return { x: width - point.x, y: point.y };
}
