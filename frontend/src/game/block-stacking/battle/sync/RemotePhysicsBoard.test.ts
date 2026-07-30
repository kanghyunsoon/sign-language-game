import { describe, expect, it } from "vitest";
import { RemotePhysicsBoard } from "./RemotePhysicsBoard";

const spawn = { type: "SPAWN_LETTER" as const, sequence: 1, matchId: "m", playerId: "opponent", letterId: "opponent-1", spawnIndex: 1, symbol: "ㄱ", spawnAt: 0, normalizedX: .1, initialAngle: 0 };

describe("RemotePhysicsBoard", () => {
  it("drops each confirmed opponent letter from the board center", () => {
    const board = new RemotePhysicsBoard();
    board.resize(400, 600);
    expect(board.spawn(spawn, 0)).toBe(true);
    expect(board.renderStates(0)[0]).toMatchObject({ id: "opponent-1", x: 200 });
  });

  it("does not let incoming transform positions move the local physics drop", () => {
    const board = new RemotePhysicsBoard();
    board.resize(400, 600);
    board.spawn(spawn, 0);
    board.apply({ type: "BODY_TRANSFORM_BATCH", sequence: 2, matchId: "m", playerId: "opponent", sentAt: 0, bodies: [{ id: "opponent-1", symbol: "ㄱ", x: .9, y: .8, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, state: "FALLING" }] }, 0);
    expect(board.renderStates(0)[0]?.x).toBe(200);
  });
});
