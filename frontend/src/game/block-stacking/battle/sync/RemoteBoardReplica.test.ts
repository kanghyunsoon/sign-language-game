import { describe, expect, it } from "vitest";
import { DEFAULT_BATTLE_SYNC_CONFIG } from "./InterpolationConfig";
import { RemoteBoardReplica } from "./RemoteBoardReplica";
import type { BattleBodyTransform } from "../transport/battleTransportTypes";
const body = (id: string, x: number): BattleBodyTransform => ({ id, symbol: "ㄴ", x, y: .5, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, state: "FALLING" });
describe("RemoteBoardReplica", () => {
  it("maps normalized coordinates to viewport", () => { const r = new RemoteBoardReplica({ ...DEFAULT_BATTLE_SYNC_CONFIG, interpolationDelayMs: 0 }, 200, 100); r.apply({ type: "BOARD_SNAPSHOT", sequence: 1, matchId: "m", playerId: "p", sentAt: 0, bodies: [body("a", .5)] }, 0); expect(r.renderStates(0)[0]).toMatchObject({ x: 100, y: 50 }); });
  it("ignores old batches", () => { const r = new RemoteBoardReplica(DEFAULT_BATTLE_SYNC_CONFIG); expect(r.apply({ type: "BODY_TRANSFORM_BATCH", sequence: 2, matchId: "m", playerId: "p", sentAt: 0, bodies: [body("a", .2)] }, 0)).toBe(true); expect(r.apply({ type: "BODY_TRANSFORM_BATCH", sequence: 1, matchId: "m", playerId: "p", sentAt: 1, bodies: [body("a", .9)] }, 1)).toBe(false); });
  it("ignores late transforms for removed letters", () => { const r = new RemoteBoardReplica(DEFAULT_BATTLE_SYNC_CONFIG); r.apply({ type: "LETTER_REMOVED_SYNC", sequence: 2, matchId: "m", playerId: "p", letterId: "a" }, 0); expect(r.apply({ type: "BODY_TRANSFORM_BATCH", sequence: 3, matchId: "m", playerId: "p", sentAt: 1, bodies: [body("a", .5)] }, 1)).toBe(true); expect(r.renderStates(10)).toHaveLength(0); });
  it("recovers the complete board from snapshot", () => { const r = new RemoteBoardReplica({ ...DEFAULT_BATTLE_SYNC_CONFIG, interpolationDelayMs: 0 }); r.apply({ type: "BOARD_SNAPSHOT", sequence: 1, matchId: "m", playerId: "p", sentAt: 0, bodies: [body("a", .2), body("b", .4)] }, 0); r.apply({ type: "BOARD_SNAPSHOT", sequence: 2, matchId: "m", playerId: "p", sentAt: 1, bodies: [body("b", .8)] }, 1); expect(r.renderStates(1).map((s) => s.id)).toEqual(["b"]); });
  it("keeps transform history when a later complete board snapshot arrives", () => {
    const r = new RemoteBoardReplica({ ...DEFAULT_BATTLE_SYNC_CONFIG, interpolationDelayMs: 50 }, 100, 100);
    r.apply({ type: "BOARD_SNAPSHOT", sequence: 0, matchId: "m", playerId: "p", sentAt: -100, bodies: [body("a", .1)] }, 900);
    r.apply({ type: "BODY_TRANSFORM_BATCH", sequence: 1, matchId: "m", playerId: "p", sentAt: 0, bodies: [body("a", .1)] }, 1_000);
    r.apply({ type: "BODY_TRANSFORM_BATCH", sequence: 2, matchId: "m", playerId: "p", sentAt: 100, bodies: [body("a", .9)] }, 1_100);
    r.apply({ type: "BOARD_SNAPSHOT", sequence: 3, matchId: "m", playerId: "p", sentAt: 200, bodies: [body("a", .4)] }, 1_200);
    expect(r.renderStates(1_200)[0]?.x).toBeCloseTo(65);
  });
  it("keeps an opponent spawn visible until the first complete board snapshot", () => {
    const r = new RemoteBoardReplica({ ...DEFAULT_BATTLE_SYNC_CONFIG, interpolationDelayMs: 0 }, 100, 100);
    r.spawn({ type: "SPAWN_LETTER", sequence: 9, matchId: "m", playerId: "opponent", letterId: "opponent-1", spawnIndex: 1, symbol: "ㄴ", spawnAt: 0, normalizedX: .3, initialAngle: 0 }, 10);
    expect(r.renderStates(10)[0]).toMatchObject({ id: "opponent-1", x: 30, y: -10 });
  });
  it("keeps sender timing when several transforms arrive in one browser burst", () => {
    const r = new RemoteBoardReplica({ ...DEFAULT_BATTLE_SYNC_CONFIG, interpolationDelayMs: 25 }, 100, 100);
    r.apply({ type: "BODY_TRANSFORM_BATCH", sequence: 1, matchId: "m", playerId: "p", sentAt: 0, bodies: [body("a", .1)] }, 1_000);
    r.apply({ type: "BODY_TRANSFORM_BATCH", sequence: 2, matchId: "m", playerId: "p", sentAt: 100, bodies: [body("a", .9)] }, 1_005);
    expect(r.renderStates(1_075)[0]?.x).toBeCloseTo(50);
  });
});
