import { describe, expect, it } from "vitest";
import { DEFAULT_LINE_RACE_RUNTIME_CONFIG } from "./LineRaceRuntimeConfig";
import { LocalRaceProgressModel } from "./RaceProgressModel";

describe("LocalRaceProgressModel", () => {
  it("validates players and keeps logical progress stable across penalties", () => {
    expect(() => new LocalRaceProgressModel(["A"], DEFAULT_LINE_RACE_RUNTIME_CONFIG)).toThrow("exactly two");
    const model = new LocalRaceProgressModel(["A", "B"], DEFAULT_LINE_RACE_RUNTIME_CONFIG);
    model.start(1_000);
    const distancePerSecond = DEFAULT_LINE_RACE_RUNTIME_CONFIG.baseSpeedPerSecond;
    expect(model.getProgress("A", 2_000)).toBe(distancePerSecond);
    model.applyPenalty("A", 500);
    expect(model.getProgress("A", 2_000)).toBe(distancePerSecond);
    expect(model.getProgress("A", 2_500)).toBe(distancePerSecond);
    expect(model.getProgress("A", 3_000)).toBe(distancePerSecond * 1.5);
  });

  it("clamps progress and finalizes a player", () => {
    const model = new LocalRaceProgressModel(["A", "B"], { ...DEFAULT_LINE_RACE_RUNTIME_CONFIG, raceLength: 120 });
    model.start(0);
    model.finishPlayer("A", 500);
    expect(model.getPlayerSnapshot("A", 500)).toMatchObject({ progress: 120, state: "FINISHED", finishedAt: 500 });
  });
});
