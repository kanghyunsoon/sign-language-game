import { describe, expect, it } from "vitest";
import { SeededRandom } from "./SeededRandom";
import { createLocalBotPracticeSession } from "./createLocalBotPracticeSession";

describe("SeededRandom", () => {
  it("reproduces choices, timing values, and success decisions from the same seed", () => {
    const left = new SeededRandom(12_345); const right = new SeededRandom(12_345);
    const sequence = (random: SeededRandom) => [random.between(2_500, 4_000), random.pick(["ㄱ", "ㅏ", "ㅁ"]), random.chance(.5), random.between(800, 1_800)];
    expect(sequence(left)).toEqual(sequence(right));
  });
  it("rejects invalid ranges and probabilities", () => {
    const random = new SeededRandom(1);
    expect(() => random.between(2, 1)).toThrow(); expect(() => random.chance(2)).toThrow(); expect(() => random.pick([])).toThrow();
  });
  it("deals the same initial bot hand for the same practice seed", () => {
    const left = createLocalBotPracticeSession({ seed: 99 }); const right = createLocalBotPracticeSession({ seed: 99 });
    expect(left.botTransport.getSnapshot().attackHand).toEqual(right.botTransport.getSnapshot().attackHand);
    left.dispose(); right.dispose();
  });
});
