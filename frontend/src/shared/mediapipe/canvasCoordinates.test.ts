import { describe, expect, it } from "vitest";

import { landmarkToFittedCanvasPoint } from "./canvasCoordinates";

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
});
