import { describe, expect, it } from "vitest";
import { parseServerMessage } from "./serverMessages";

const prediction = (patch: Record<string, unknown> = {}) => JSON.stringify({
  type: "PREDICTION", frameId: 1, symbol: "ㄱ", confidence: .8, isStable: false, predictedAt: 100,
  topCandidates: [{ symbol: "ㄱ", confidence: .8 }, { symbol: "ㄴ", confidence: .6 }], ...patch,
});

describe("PREDICTION topCandidates contract", () => {
  it("parses a sorted candidate list and preserves legacy messages without it", () => {
    expect(parseServerMessage(prediction())).toMatchObject({ type: "PREDICTION", topCandidates: [{ symbol: "ㄱ", confidence: .8 }, { symbol: "ㄴ", confidence: .6 }] });
    expect(parseServerMessage(JSON.stringify({ type: "PREDICTION", frameId: 2, symbol: "ㄴ", confidence: .7, isStable: false, predictedAt: 101 }))).toEqual({
      type: "PREDICTION", frameId: 2, symbol: "ㄴ", confidence: .7, isStable: false, predictedAt: 101,
    });
  });

  it.each([
    ["duplicates", [{ symbol: "ㄱ", confidence: .8 }, { symbol: "ㄱ", confidence: .6 }]],
    ["out of range", [{ symbol: "ㄱ", confidence: .8 }, { symbol: "ㄴ", confidence: 1.1 }]],
    ["unsorted", [{ symbol: "ㄱ", confidence: .8 }, { symbol: "ㄴ", confidence: .9 }]],
    ["top-1 mismatch", [{ symbol: "ㄴ", confidence: .8 }, { symbol: "ㄱ", confidence: .6 }]],
  ])("rejects %s candidates", (_name, topCandidates) => {
    expect(() => parseServerMessage(prediction({ topCandidates }))).toThrow();
  });
});
