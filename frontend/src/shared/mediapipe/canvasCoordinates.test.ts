import { describe, expect, it } from "vitest";

import { isHandVisibleInViewport, landmarkToFittedCanvasPoint, visibleSourceBounds } from "./canvasCoordinates";

describe("landmarkToFittedCanvasPoint", () => {
  it("accounts for horizontal cropping when a portrait viewport covers a landscape video", () => {
    const leftVisibleEdge = landmarkToFittedCanvasPoint(
      { x: 0.21875, y: 0.5, z: 0 },
      300,
      400,
      640,
      480,
      "cover",
    );
    const center = landmarkToFittedCanvasPoint(
      { x: 0.5, y: 0.5, z: 0 },
      300,
      400,
      640,
      480,
      "cover",
    );

    expect(leftVisibleEdge.x).toBeCloseTo(0);
    expect(center).toEqual({ x: 150, y: 200 });
  });

  it("accounts for letterboxing when a landscape viewport contains a portrait video", () => {
    const topLeft = landmarkToFittedCanvasPoint(
      { x: 0, y: 0, z: 0 },
      400,
      200,
      300,
      400,
      "contain",
    );

    expect(topLeft.x).toBeCloseTo(125);
    expect(topLeft.y).toBeCloseTo(0);
  });

  it("exposes only the center source slice for a covered portrait camera", () => {
    expect(visibleSourceBounds(640, 480, 300, 400, "cover")).toEqual({
      left: 0.21875,
      top: 0,
      right: 0.78125,
      bottom: 1,
    });
  });

  it("does not recognize a hand whose palm is in the cropped-out part of the video", () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
    landmarks[0] = { x: .1, y: .5, z: 0 };

    expect(isHandVisibleInViewport(landmarks, 640, 480, 300, 400, "cover")).toBe(false);
    landmarks[0] = { x: .5, y: .5, z: 0 };
    expect(isHandVisibleInViewport(landmarks, 640, 480, 300, 400, "cover")).toBe(true);
  });
});
