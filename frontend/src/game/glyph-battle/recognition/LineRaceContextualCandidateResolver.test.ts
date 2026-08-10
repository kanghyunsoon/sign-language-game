import { describe, expect, it } from "vitest";
import type { SignRecognitionEvent } from "../../recognition";
import type { LineRaceInputContext } from "./LineRaceInputContext";
import { LineRaceContextualCandidateResolver } from "./LineRaceContextualCandidateResolver";

const aiSymbols = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅅ", "ㅌ"];
const base = (): LineRaceInputContext => ({
  matchState: "PLAYING",
  attackHand: ["ㄱ", "ㄴ", "ㄷ"],
  attackCooldownEndsAt: 0,
  now: 1_000,
  pendingObstacleCount: 0,
  maxPendingObstacles: 3,
  supportedSymbols: aiSymbols,
  counterableObstacles: [],
});
const prediction = (
  candidates: readonly { symbol: string; confidence: number }[],
): Extract<SignRecognitionEvent, { type: "PREDICTION" }> => ({
  type: "PREDICTION",
  frameId: 1,
  symbol: candidates[0]!.symbol,
  confidence: candidates[0]!.confidence,
  isStable: false,
  predictedAt: 1_000,
  topCandidates: candidates,
});

describe("LineRaceContextualCandidateResolver", () => {
  it("selects an in-hand second candidate when threshold and eligible margin pass", () => {
    const resolver = new LineRaceContextualCandidateResolver(base);
    const token = resolver.captureContext(aiSymbols);
    const result = resolver.resolve(
      prediction([
        { symbol: "ㅌ", confidence: .8 },
        { symbol: "ㄱ", confidence: .7 },
        { symbol: "ㄴ", confidence: .4 },
      ]),
      aiSymbols,
      token,
    );
    expect(result.selectedCandidate).toEqual({ symbol: "ㄱ", confidence: .7 });
    expect(result.diagnostics.rawTop1).toMatchObject({ symbol: "ㅌ" });
    expect(result.diagnostics.rejectionReason).toBeUndefined();
    expect(result.diagnostics.margin).toBeCloseTo(.3);
  });

  it("does not select an eligible candidate below its readiness threshold", () => {
    const resolver = new LineRaceContextualCandidateResolver(base);
    const token = resolver.captureContext(aiSymbols);
    const result = resolver.resolve(
      prediction([{ symbol: "ㅌ", confidence: .8 }, { symbol: "ㄱ", confidence: .49 }]),
      aiSymbols,
      token,
    );
    expect(result.diagnostics.rejectionReason).toBe("BELOW_THRESHOLD");
  });

  it("keeps an insufficient eligible margin ambiguous", () => {
    const resolver = new LineRaceContextualCandidateResolver(base);
    const token = resolver.captureContext(aiSymbols);
    const result = resolver.resolve(
      prediction([
        { symbol: "ㅌ", confidence: .9 },
        { symbol: "ㄱ", confidence: .7 },
        { symbol: "ㄴ", confidence: .65 },
      ]),
      aiSymbols,
      token,
    );
    expect(result.diagnostics.rejectionReason).toBe("AMBIGUOUS");
    expect(result.diagnostics.margin).toBeCloseTo(.05);
  });

  it("uses counterable obstacle symbols instead of the attack hand", () => {
    const context: LineRaceInputContext = {
      ...base(),
      counterableObstacles: [{
        obstacleId: "near",
        symbol: "ㄴ",
        distanceToRunner: 10,
        counterDeadlineAt: 1_500,
        state: "ACTIVE",
      }],
    };
    const resolver = new LineRaceContextualCandidateResolver(() => context);
    const token = resolver.captureContext(aiSymbols);
    const result = resolver.resolve(
      prediction([{ symbol: "ㄱ", confidence: .9 }, { symbol: "ㄴ", confidence: .7 }]),
      aiSymbols,
      token,
    );
    expect(result.selectedCandidate).toEqual({ symbol: "ㄴ", confidence: .7 });
    expect(result.diagnostics.eligibleSymbols).toEqual(["ㄴ"]);
  });

  it("keeps context stable while one obstacle moves, but changes it when counter priority changes", () => {
    let context: LineRaceInputContext = {
      ...base(),
      counterableObstacles: [
        { obstacleId: "first", symbol: "ㄱ", distanceToRunner: 8, counterDeadlineAt: 1_500, state: "ACTIVE" },
        { obstacleId: "second", symbol: "ㄴ", distanceToRunner: 12, counterDeadlineAt: 1_600, state: "FALLING" },
      ],
    };
    const resolver = new LineRaceContextualCandidateResolver(() => context);
    const original = resolver.captureContext(aiSymbols);
    context = {
      ...context,
      now: 1_050,
      counterableObstacles: context.counterableObstacles.map((obstacle) => ({
        ...obstacle, distanceToRunner: obstacle.distanceToRunner - 1,
      })),
    };
    expect(resolver.captureContext(aiSymbols)).toBe(original);
    context = {
      ...context,
      counterableObstacles: [context.counterableObstacles[1]!, context.counterableObstacles[0]!]
        .map((obstacle, index) => ({ ...obstacle, distanceToRunner: index + 1 })),
    };
    expect(resolver.captureContext(aiSymbols)).not.toBe(original);
  });

  it("rejects stale context and never enables readiness-excluded symbols", () => {
    let context = base();
    const resolver = new LineRaceContextualCandidateResolver(() => context);
    const token = resolver.captureContext(aiSymbols);
    context = { ...context, attackHand: ["ㄹ", "ㅁ", "ㅌ"] };
    expect(
      resolver.resolve(prediction([{ symbol: "ㄱ", confidence: .9 }]), aiSymbols, token).diagnostics.rejectionReason,
    ).toBe("STALE_CONTEXT");

    context = { ...context, attackHand: ["ㅅ", "ㄹ", "ㅁ"] };
    const current = resolver.captureContext(aiSymbols);
    const excluded = resolver.resolve(prediction([{ symbol: "ㅅ", confidence: .9999 }]), aiSymbols, current);
    expect(excluded.selectedCandidate).toBeUndefined();
    expect(excluded.diagnostics.eligibleSymbols).not.toContain("ㅅ");
  });

  it("returns identical decisions for local and network contexts", () => {
    const local = base();
    const network = structuredClone(local);
    const event = prediction([{ symbol: "ㅌ", confidence: .8 }, { symbol: "ㄱ", confidence: .7 }]);
    const localResolver = new LineRaceContextualCandidateResolver(() => local);
    const networkResolver = new LineRaceContextualCandidateResolver(() => network);
    expect(localResolver.resolve(event, aiSymbols, localResolver.captureContext(aiSymbols))).toEqual(
      networkResolver.resolve(event, aiSymbols, networkResolver.captureContext(aiSymbols)),
    );
  });
});
