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
    // 클램프 값 자체는 체감에 맞춰 조정되는 값이다(beb5b25에서 0.065 -> 0.14).
    // 그래서 결과 좌표를 그대로 박아 두지 않고, 클램프가 살아 있는지만 본다.
    const current = { x: 0.8, y: 0.8, z: 0.5 };
    const result = predictLandmarksForDisplay(
      { landmarks: [{ x: 0.2, y: 0.2, z: 0 }], capturedAt: 100 },
      { landmarks: [current], capturedAt: 133 },
      300,
    );
    // 시간만으로 외삽하면 0.8 + 0.6 * (167 / 33) ≈ 3.8 로 화면을 한참 벗어난다.
    const SAFETY_CEILING = 0.2;
    expect(result[0]!.x).toBeGreaterThan(current.x);
    expect(result[0]!.y).toBeGreaterThan(current.y);
    expect(result[0]!.x - current.x).toBeLessThanOrEqual(SAFETY_CEILING);
    expect(result[0]!.y - current.y).toBeLessThanOrEqual(SAFETY_CEILING);
    expect(result[0]!.z - current.z).toBeLessThanOrEqual(SAFETY_CEILING);
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
