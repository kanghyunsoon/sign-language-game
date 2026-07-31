import { describe, expect, it, vi } from "vitest";

import { WordPredictionDecoder } from "./WordPredictionDecoder";

describe("WordPredictionDecoder", () => {
  it("같은 단어가 6프레임 누적되기 전에는 정답으로 확정하지 않는다", () => {
    const decoder = new WordPredictionDecoder();
    const listener = vi.fn();
    decoder.subscribe(listener);

    for (let frame = 1; frame <= 5; frame += 1) {
      decoder.pushPrediction({
        symbol: "run",
        confidence: 0.9,
        predictedAt: frame * 50,
      });
    }

    expect(listener).not.toHaveBeenCalled();

    decoder.pushPrediction({
      symbol: "run",
      confidence: 0.9,
      predictedAt: 300,
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SIGN_CONFIRMED",
        symbol: "run",
      }),
    );
  });

  it("최근 8프레임에서 같은 단어가 6번 미만이면 확정하지 않는다", () => {
    const decoder = new WordPredictionDecoder();
    const listener = vi.fn();
    decoder.subscribe(listener);

    ["run", "walk", "run", "walk", "run", "walk", "run", "run"].forEach(
      (symbol, index) => {
        decoder.pushPrediction({
          symbol,
          confidence: 0.9,
          predictedAt: index * 50,
        });
      },
    );

    expect(listener).not.toHaveBeenCalled();
  });
});
