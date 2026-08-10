import { describe, expect, it } from "vitest";
import { NormalizedLandmarkPoseDistance } from "./LandmarkPoseDistance";
import type { NormalizedLandmark } from "./signDecoderTypes";

const hand = (): NormalizedLandmark[] => Array.from({ length: 21 }, (_, index) => ({
  x: (index % 4) * .03,
  y: Math.floor(index / 4) * .035,
  z: (index % 3) * .005,
}));

describe("NormalizedLandmarkPoseDistance", () => {
  it("is insensitive to translation and scale", () => {
    const reference = hand();
    const moved = reference.map((point) => ({ x: point.x * 1.7 + .35, y: point.y * 1.7 - .2, z: point.z * 1.7 + .1 }));
    expect(new NormalizedLandmarkPoseDistance().calculate(reference, moved)).toBeLessThan(.001);
  });

  it("detects finger articulation changes", () => {
    const reference = hand();
    const changed = reference.map((point, index) => index >= 8 ? { ...point, x: point.x + .12, y: point.y - .08 } : point);
    expect(new NormalizedLandmarkPoseDistance().calculate(reference, changed)).toBeGreaterThan(.12);
  });
});
