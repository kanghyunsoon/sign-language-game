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

describe("PREDICTION stage/verdict/feedback (word model v7)", () => {
  it("parses stage, verdict and feedback when present", () => {
    expect(parseServerMessage(prediction({
      symbol: "wrong", stage: "final", verdict: "wrong-form",
      feedback: ["역방향으로 수행했어요"],
      topCandidates: [{ symbol: "wrong", confidence: .8 }, { symbol: "ㄴ", confidence: .6 }],
    }))).toMatchObject({
      symbol: "wrong", stage: "final", verdict: "wrong-form",
      feedback: ["역방향으로 수행했어요"],
    });
  });

  it("omits stage/verdict/feedback for legacy messages without them", () => {
    const message = parseServerMessage(JSON.stringify({
      type: "PREDICTION", frameId: 3, symbol: "moon", confidence: .9, isStable: true, predictedAt: 102,
    }));
    expect(message).toMatchObject({ symbol: "moon" });
    expect((message as { stage?: unknown }).stage).toBeUndefined();
    expect((message as { verdict?: unknown }).verdict).toBeUndefined();
    expect((message as { feedback?: unknown }).feedback).toBeUndefined();
  });

  it.each([
    ["stage", { stage: "in-progress" }],
    ["verdict", { verdict: "unknown" }],
    ["feedback", { feedback: [""] }],
  ])("rejects an invalid %s", (_name, patch) => {
    expect(() => parseServerMessage(prediction(patch))).toThrow();
  });
});
