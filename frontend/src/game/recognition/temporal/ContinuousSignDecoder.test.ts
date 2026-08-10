import { beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultContinuousSignDecoder } from "./ContinuousSignDecoder";
import type { SignDecoderConfig } from "./SignDecoderConfig";
import type { NormalizedLandmark, SignDecoderFrame } from "./signDecoderTypes";

const CONFIG: SignDecoderConfig = {
  minimumConfidence: .75, candidateWindowSize: 5, minimumCandidateVotes: 3, minimumStableDurationMs: 80,
  movementThreshold: .035, maximumPredictionAgeMs: 250, releasePoseDistanceThreshold: .12,
  releaseMinimumDurationMs: 50, noHandReleaseDurationMs: 40, differentSymbolReleaseVotes: 2,
};
const base = (): NormalizedLandmark[] => Array.from({ length: 21 }, (_, index) => ({ x: (index % 4) * .03, y: Math.floor(index / 4) * .035, z: 0 }));
const changed = (): NormalizedLandmark[] => base().map((point, index) => index >= 4 ? { ...point, x: point.x + .15, y: point.y - .1 } : point);
const shifted = (): NormalizedLandmark[] => base().map((point) => ({ ...point, x: point.x + .3, y: point.y + .2 }));
// Frontal fingerspelling: MediaPipe flips the occluded fingertips back and forth between
// frames without the hand actually moving. Legacy motion analysis read this as MOVING on
// every frame, so the candidate was cleared and ㅓ/ㅕ/ㅔ/ㅖ could never be confirmed.
const FINGERTIPS = new Set([4, 8, 12, 16, 20]);
const fingertipJitter = (parity: number): NormalizedLandmark[] =>
  base().map((point, index) => (FINGERTIPS.has(index) ? { ...point, x: point.x + (parity === 0 ? .004 : -.004) } : point));
const frame = (at: number, landmarks = base(), prediction?: { symbol: string; confidence?: number; sequence: number; predictedAt?: number }): SignDecoderFrame => ({
  capturedAt: at, handPresent: true, rawLandmarks: landmarks, normalizedLandmarks: landmarks,
  prediction: prediction ? { symbol: prediction.symbol, confidence: prediction.confidence ?? .95, sequence: prediction.sequence, predictedAt: prediction.predictedAt ?? at } : undefined,
});
const predictionOnly = (at: number, symbol: string, sequence: number, confidence = .95, predictedAt = at): SignDecoderFrame => ({ handPresent: true, capturedAt: at, prediction: { symbol, sequence, confidence, predictedAt } });

describe("DefaultContinuousSignDecoder", () => {
  let decoder: DefaultContinuousSignDecoder;
  beforeEach(async () => { decoder = new DefaultContinuousSignDecoder({ config: CONFIG }); await decoder.start(); });

  it("moves NO_HAND -> TRACKING -> CANDIDATE and confirms only after votes and stability", () => {
    const listener = vi.fn(); decoder.subscribe(listener);
    decoder.pushFrame(frame(0)); decoder.pushFrame(frame(40)); decoder.pushFrame(predictionOnly(40, "ㄱ", 1));
    decoder.pushFrame(frame(80)); decoder.pushFrame(predictionOnly(80, "ㄱ", 2)); decoder.pushFrame(predictionOnly(100, "ㄱ", 3));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "SIGN_CONFIRMED", symbol: "ㄱ" }));
    expect(decoder.getSnapshot()).toMatchObject({ state: "RELEASE_WAIT", confirmations: 1, lastConfirmedSymbol: "ㄱ" });
  });

  it("blocks confirmation while moving and clears an intermediate misclassification", () => {
    const listener = vi.fn(); decoder.subscribe(listener);
    decoder.pushFrame(frame(0)); decoder.pushFrame(frame(40, changed()));
    decoder.pushFrame(predictionOnly(40, "ㅅ", 1)); decoder.pushFrame(predictionOnly(50, "ㅅ", 2)); decoder.pushFrame(predictionOnly(60, "ㅅ", 3));
    expect(decoder.getSnapshot().state).toBe("MOVING");
    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SIGN_CONFIRMED" }));
    decoder.pushFrame(frame(100, changed())); decoder.pushFrame(frame(140, changed())); decoder.pushFrame(predictionOnly(140, "ㄴ", 4));
    decoder.pushFrame(frame(180, changed())); decoder.pushFrame(predictionOnly(180, "ㄴ", 5)); decoder.pushFrame(predictionOnly(190, "ㄴ", 6));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "SIGN_CONFIRMED", symbol: "ㄴ" }));
    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SIGN_CONFIRMED", symbol: "ㅅ" }));
  });

  it("rejects low-confidence, stale, and duplicate-sequence predictions", () => {
    decoder.pushFrame(frame(0)); decoder.pushFrame(frame(80));
    decoder.pushFrame(predictionOnly(100, "ㄱ", 1, .5));
    decoder.pushFrame(predictionOnly(500, "ㄱ", 2, .95, 100));
    decoder.pushFrame(predictionOnly(510, "ㄱ", 2));
    expect(decoder.getSnapshot()).toMatchObject({ confirmations: 0, stalePredictions: 1, droppedPredictions: 1 });
  });

  it("uses calibrated per-symbol confidence without lowering every class", () => {
    decoder.updateConfig({ minimumConfidenceBySymbol: { "ㅅ": .99, "ㄱ": .5 } });
    decoder.pushFrame(frame(0)); decoder.pushFrame(frame(80));
    decoder.pushFrame(predictionOnly(80, "ㅅ", 1, .8));
    decoder.pushFrame(predictionOnly(90, "ㄱ", 2, .6));
    decoder.pushFrame(predictionOnly(100, "ㄱ", 3, .6));
    decoder.pushFrame(predictionOnly(110, "ㄱ", 4, .6));
    expect(decoder.getSnapshot()).toMatchObject({ lastConfirmedSymbol: "ㄱ", confirmations: 1 });
  });

  it("releases when the hand disappears", () => {
    const listener = vi.fn(); decoder.subscribe(listener);
    confirm(decoder, "ㄱ", 1);
    decoder.pushFrame({ capturedAt: 150, handPresent: false });
    decoder.pushFrame({ capturedAt: 200, handPresent: false });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "HAND_RELEASED", previousSymbol: "ㄱ" }));
    expect(decoder.getSnapshot().state).toBe("NO_HAND");
  });

  it("releases to a stable different symbol without removing the hand", () => {
    const listener = vi.fn(); decoder.subscribe(listener);
    confirm(decoder, "ㄱ", 1);
    decoder.pushFrame(predictionOnly(150, "ㄴ", 10)); decoder.pushFrame(predictionOnly(160, "ㄴ", 11));
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "HAND_RELEASED", previousSymbol: "ㄱ" }));
  });

  it("keeps the confirmed symbol while the pose is unchanged", () => {
    const listener = vi.fn(); confirm(decoder, "ㄱ", 1); decoder.subscribe(listener);
    decoder.pushFrame(frame(130, shifted())); decoder.pushFrame(frame(190, shifted()));
    expect(decoder.getSnapshot().releasePoseDistance).toBeLessThan(.01);
    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: "HAND_RELEASED" }));
  });

  it("does not confirm alternating jitter predictions without enough votes", () => {
    const listener = vi.fn(); decoder.subscribe(listener);
    decoder.pushFrame(frame(0)); decoder.pushFrame(frame(40)); decoder.pushFrame(frame(80));
    decoder.pushFrame(predictionOnly(80, "ㄱ", 1)); decoder.pushFrame(predictionOnly(90, "ㅅ", 2));
    decoder.pushFrame(predictionOnly(100, "ㄴ", 3)); decoder.pushFrame(predictionOnly(110, "ㅅ", 4)); decoder.pushFrame(predictionOnly(120, "ㄱ", 5));
    expect(listener).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SIGN_CONFIRMED" }));
  });

  it("emits a fast A-B-C sequence once per stable symbol", () => {
    decoder.updateConfig({ minimumCandidateVotes: 2, minimumStableDurationMs: 40 });
    const listener = vi.fn(); decoder.subscribe(listener);
    decoder.pushFrame(frame(0)); decoder.pushFrame(frame(40));
    decoder.pushFrame(predictionOnly(40, "ㄱ", 1)); decoder.pushFrame(predictionOnly(50, "ㄱ", 2));
    decoder.pushFrame(predictionOnly(70, "ㄴ", 3)); decoder.pushFrame(predictionOnly(80, "ㄴ", 4)); decoder.pushFrame(predictionOnly(90, "ㄴ", 5));
    decoder.pushFrame(predictionOnly(110, "ㄷ", 6)); decoder.pushFrame(predictionOnly(120, "ㄷ", 7)); decoder.pushFrame(predictionOnly(130, "ㄷ", 8));
    expect(listener.mock.calls.filter(([event]) => event.type === "SIGN_CONFIRMED").map(([event]) => event.symbol)).toEqual(["ㄱ", "ㄴ", "ㄷ"]);
  });

  it("confirms a frontal handshape while MediaPipe jitters the fingertips in place", () => {
    const listener = vi.fn(); decoder.subscribe(listener);
    for (let step = 0; step < 6; step += 1) {
      const at = step * 40;
      decoder.pushFrame(frame(at, fingertipJitter(step % 2)));
      if (step >= 2) decoder.pushFrame(predictionOnly(at, "ㅕ", step));
    }
    expect(decoder.getSnapshot().motion.moving).toBe(false);
    expect(decoder.getSnapshot().motion.jitterRatio).toBeLessThan(.5);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "SIGN_CONFIRMED", symbol: "ㅕ" }));
  });

  it("supports runtime config changes and records average/P95 confirmation latency", () => {
    decoder.updateConfig({ minimumCandidateVotes: 2, minimumStableDurationMs: 40 });
    decoder.pushFrame(frame(0)); decoder.pushFrame(frame(40)); decoder.pushFrame(predictionOnly(40, "ㄱ", 1, .9, 10)); decoder.pushFrame(predictionOnly(80, "ㄱ", 2, .9, 20));
    expect(decoder.getConfig().minimumCandidateVotes).toBe(2);
    expect(decoder.getSnapshot()).toMatchObject({ confirmations: 1, averageConfirmationLatencyMs: 70, p95ConfirmationLatencyMs: 70 });
    expect(() => decoder.updateConfig({ minimumCandidateVotes: 9 })).toThrow();
  });
});

function confirm(decoder: DefaultContinuousSignDecoder, symbol: string, sequence: number): void {
  decoder.pushFrame(frame(0)); decoder.pushFrame(frame(40)); decoder.pushFrame(predictionOnly(40, symbol, sequence));
  decoder.pushFrame(frame(80)); decoder.pushFrame(predictionOnly(80, symbol, sequence + 1)); decoder.pushFrame(predictionOnly(100, symbol, sequence + 2));
}
