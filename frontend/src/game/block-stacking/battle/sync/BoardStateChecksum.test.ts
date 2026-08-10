import { describe, expect, it } from "vitest";
import type { BattleBodyTransform } from "../transport/battleTransportTypes";
import { boardStateChecksum } from "./BoardStateChecksum";

const body = (id: string, x: number): BattleBodyTransform => ({
  id,
  symbol: "ㄱ",
  x,
  y: .5,
  angle: 0,
  velocityX: 0,
  velocityY: 0,
  angularVelocity: 0,
  state: "SETTLED",
});

describe("boardStateChecksum", () => {
  it("is independent of body array order", () => {
    expect(boardStateChecksum([body("a", .1), body("b", .2)]))
      .toBe(boardStateChecksum([body("b", .2), body("a", .1)]));
  });

  it("changes when an authoritative transform changes", () => {
    expect(boardStateChecksum([body("a", .1)]))
      .not.toBe(boardStateChecksum([body("a", .2)]));
  });
});
