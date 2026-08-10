import { describe, expect, it } from "vitest";
import { SignCandidateWindow } from "./SignCandidateWindow";

describe("SignCandidateWindow", () => {
  it("keeps a bounded vote window and resolves ties by the newest symbol", () => {
    const window = new SignCandidateWindow(3);
    window.add({ symbol: "ㄱ", confidence: .8, predictedAt: 1, sequence: 1 });
    window.add({ symbol: "ㄴ", confidence: .9, predictedAt: 2, sequence: 2 });
    expect(window.add({ symbol: "ㄱ", confidence: 1, predictedAt: 3, sequence: 3 })).toMatchObject({ symbol: "ㄱ", votes: 2, averageConfidence: .9 });
    expect(window.add({ symbol: "ㄴ", confidence: .7, predictedAt: 4, sequence: 4 })).toMatchObject({ symbol: "ㄴ", votes: 2 });
    expect(window.getSamples()).toHaveLength(3);
  });
});
