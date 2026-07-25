import { describe, expect, it } from "vitest";

import { predictLandmarksForDisplay, stabilizeLandmarksForDisplay } from "./predictLandmarksForDisplay";

describe("predictLandmarksForDisplay", () => {
  it("keeps the first sample unchanged", () => {
    const landmarks = [{ x: 0.4, y: 0.5, z: 0 }];
    expect(predictLandmarksForDisplay(undefined, { landmarks, capturedAt: 100 }, 140)).toBe(landmarks);
  });

  it("projects moving landmarks toward the current motion direction", () => {
    const result = predictLandmarksForDisplay(
      { landmarks: [{ x: 0.4, y: 0.5, z: 0 }], capturedAt: 100 },
      { landmarks: [{ x: 0.42, y: 0.48, z: 0 }], capturedAt: 133 },
      166,
    );
    expect(result[0]?.x).toBeGreaterThan(0.42);
    expect(result[0]?.y).toBeLessThan(0.48);
  });

  it("caps prediction so sudden detection noise cannot jump across the screen", () => {
    const result = predictLandmarksForDisplay(
      { landmarks: [{ x: 0.2, y: 0.2, z: 0 }], capturedAt: 100 },
      { landmarks: [{ x: 0.8, y: 0.8, z: 0.5 }], capturedAt: 133 },
      300,
    );
    expect(result[0]).toEqual({ x: 0.8350000000000001, y: 0.8350000000000001, z: 0.545 });
  });

  it("smooths tiny palm jitter but lets large palm motion catch up immediately", () => {
    const small = stabilizeLandmarksForDisplay(
      [{ x: 0.5, y: 0.5, z: 0 }],
      [{ x: 0.51, y: 0.5, z: 0 }],
    );
    const large = stabilizeLandmarksForDisplay(
      [{ x: 0.2, y: 0.2, z: 0 }],
      [{ x: 0.5, y: 0.5, z: 0 }],
    );
    expect(small[0]?.x).toBeGreaterThan(0.503);
    expect(small[0]?.x).toBeLessThan(0.51);
    expect(large[0]?.x).toBe(0.5);
  });

  it("follows palm translation while damping finger-only jitter", () => {
    const previous = Array.from({ length: 21 }, (_, index) => ({
      x: 0.4 + index * 0.001,
      y: 0.5,
      z: 0,
    }));
    const current = previous.map((point) => ({ ...point, x: point.x + 0.03 }));
    current[8] = { ...current[8]!, y: current[8]!.y + 0.006 };

    const result = stabilizeLandmarksForDisplay(previous, current);

    expect(result[0]?.x).toBeCloseTo(current[0]!.x, 5);
    expect(result[8]!.y).toBeGreaterThan(previous[8]!.y);
    expect(result[8]!.y).toBeLessThan(current[8]!.y);
  });
});
