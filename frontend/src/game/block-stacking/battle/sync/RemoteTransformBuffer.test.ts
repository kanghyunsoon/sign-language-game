import { describe, expect, it } from "vitest";
import { DEFAULT_BATTLE_SYNC_CONFIG } from "./InterpolationConfig";
import { RemoteTransformBuffer } from "./RemoteTransformBuffer";
import type { BattleBodyTransform } from "../transport/battleTransportTypes";
const body = (x: number, angle = 0): BattleBodyTransform => ({ id: "a", symbol: "ㄱ", x, y: x, angle, velocityX: 0, velocityY: 0, angularVelocity: 0, state: "FALLING" });
describe("RemoteTransformBuffer", () => {
  it("interpolates position", () => { const b = new RemoteTransformBuffer({ ...DEFAULT_BATTLE_SYNC_CONFIG, interpolationDelayMs: 0 }); b.push(1, 0, body(0)); b.push(2, 100, body(.1)); expect(b.sample("a", 50)?.x).toBeCloseTo(.05); });
  it("interpolates the shortest angle", () => { const b = new RemoteTransformBuffer({ ...DEFAULT_BATTLE_SYNC_CONFIG, interpolationDelayMs: 0, snapAngleThreshold: Math.PI }); b.push(1, 0, body(0, Math.PI - .1)); b.push(2, 100, body(0, -Math.PI + .1)); expect(Math.abs(b.sample("a", 50)?.angle ?? 0)).toBeCloseTo(Math.PI); });
  it("snaps when distance is large", () => { const b = new RemoteTransformBuffer({ ...DEFAULT_BATTLE_SYNC_CONFIG, interpolationDelayMs: 0, snapDistanceThreshold: .1 }); b.push(1, 0, body(0)); b.push(2, 100, body(1)); expect(b.sample("a", 10)?.x).toBe(1); });
  it("ignores stale sequences", () => { const b = new RemoteTransformBuffer(DEFAULT_BATTLE_SYNC_CONFIG); expect(b.push(2, 2, body(.2))).toBe(true); expect(b.push(1, 3, body(.1))).toBe(false); });
  it("ignores transforms after removal", () => { const b = new RemoteTransformBuffer(DEFAULT_BATTLE_SYNC_CONFIG); b.remove("a"); expect(b.push(1, 1, body(1))).toBe(false); });
  it("bounds each letter buffer", () => { const b = new RemoteTransformBuffer({ ...DEFAULT_BATTLE_SYNC_CONFIG, maxBufferedSnapshots: 2 }); b.push(1, 1, body(.1)); b.push(2, 2, body(.2)); b.push(3, 3, body(.3)); expect(b.size("a")).toBe(2); });
  it("bounds removed-letter tombstones", () => {
    const b = new RemoteTransformBuffer(DEFAULT_BATTLE_SYNC_CONFIG);
    for (let index = 0; index < 140; index += 1) b.remove(`removed-${index}`);
    expect(b.push(1, 1, { ...body(.1), id: "removed-0" })).toBe(true);
    expect(b.push(1, 1, { ...body(.1), id: "removed-139" })).toBe(false);
  });
});
