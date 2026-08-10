import { describe, expect, it } from "vitest";
import { DevLineRaceClock } from "./DevLineRaceClock";

describe("DevLineRaceClock time scale", () => {
  it("changes virtual match speed without jumping at the scale boundary", () => {
    let source = 100; const clock = new DevLineRaceClock(() => source);
    source = 200; expect(clock.now()).toBe(200);
    clock.setTimeScale(2); expect(clock.now()).toBe(200);
    source = 300; expect(clock.now()).toBe(400);
    clock.setTimeScale(.5); source = 500; expect(clock.now()).toBe(500);
  });
});
