import { describe, expect, it } from "vitest";
import type { PhysicsLetterState } from "../physics/types";
import { chooseDistributedSpawnX } from "./DistributedSpawnPolicy";

describe("chooseDistributedSpawnX", () => {
  it("moves a new block away from an occupied vertical lane", () => {
    const states = [state("a", 300, 700), state("b", 300, 560), state("c", 300, 420)];
    const x = chooseDistributedSpawnX(states, 600, 800, 88, 0.5);
    expect(Math.abs(x - 300)).toBeGreaterThan(88);
  });

  it("uses the preferred position when the board is empty", () => {
    const x = chooseDistributedSpawnX([], 600, 800, 88, 0.8);
    expect(x).toBeGreaterThan(400);
  });
});

function state(id: string, x: number, y: number): PhysicsLetterState {
  return { id, symbol: "ㄱ", x, y, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: true };
}
