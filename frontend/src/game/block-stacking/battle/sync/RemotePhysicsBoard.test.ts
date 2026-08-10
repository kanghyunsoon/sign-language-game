import { describe, expect, it } from "vitest";
import { RemotePhysicsBoard } from "./RemotePhysicsBoard";

const spawn = { type: "SPAWN_LETTER" as const, sequence: 1, matchId: "m", playerId: "opponent", letterId: "opponent-1", spawnIndex: 1, symbol: "ㄱ", spawnAt: 0, normalizedX: .1, initialAngle: 0 };

describe("RemotePhysicsBoard", () => {
  it("drops each confirmed opponent letter from the board center", () => {
    const board = new RemotePhysicsBoard();
    board.resize(400, 600);
    expect(board.spawn(spawn, 0)).toBe(true);
    expect(board.renderStates(0)[0]).toMatchObject({ id: "opponent-1", x: 200, y: 78 });
  });

  it("does not let incoming transform positions move the local physics drop", () => {
    const board = new RemotePhysicsBoard();
    board.resize(400, 600);
    board.spawn(spawn, 0);
    board.apply({ type: "BODY_TRANSFORM_BATCH", sequence: 2, matchId: "m", playerId: "opponent", sentAt: 0, bodies: [{ id: "opponent-1", symbol: "ㄱ", x: .9, y: .8, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, state: "FALLING" }] }, 0);
    expect(board.renderStates(0)[0]?.x).toBe(200);
  });

  it("uses the source board's exact position once the letter settles", () => {
    const board = new RemotePhysicsBoard();
    board.resize(400, 600);
    board.spawn(spawn, 0);
    board.apply({ type: "BOARD_SNAPSHOT", sequence: 2, matchId: "m", playerId: "opponent", sentAt: 0, bodies: [{ id: "opponent-1", symbol: "A", x: .25, y: .8, angle: .4, velocityX: 0, velocityY: 0, angularVelocity: 0, state: "SETTLED" }] }, 0);
    expect(board.getStates()[0]).toMatchObject({ x: 100, y: 480, angle: .4, settled: true });
  });

  it("starts a refreshed falling letter from its snapshot instead of the spawn point", () => {
    const board = new RemotePhysicsBoard();
    board.resize(400, 600);
    board.apply({ type: "BOARD_SNAPSHOT", sequence: 2, matchId: "m", playerId: "opponent", sentAt: 1_000, bodies: [{ id: "falling", symbol: "A", x: .25, y: .4, angle: .2, velocityX: 1, velocityY: 3, angularVelocity: .1, state: "FALLING" }] }, 1_000);
    expect(board.getStates()[0]).toMatchObject({ id: "falling", x: 100, y: 240, angle: .2, settled: false });
  });
});
