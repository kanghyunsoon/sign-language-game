import type { HandLandmark } from "../types/landmark";

export const VECTOR_EPSILON = 1e-8;

export function subtractVector(point: HandLandmark, origin: HandLandmark): HandLandmark {
  return { x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z };
}

export function scaleVector(point: HandLandmark, scale: number): HandLandmark {
  return { x: point.x * scale, y: point.y * scale, z: point.z * scale };
}

export function vectorLength(point: HandLandmark): number {
  return Math.hypot(point.x, point.y, point.z);
}

export function rotateVectorAroundZ(point: HandLandmark, radians: number): HandLandmark {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
    z: point.z,
  };
}
