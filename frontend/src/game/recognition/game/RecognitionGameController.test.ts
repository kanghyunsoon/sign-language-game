import { describe, expect, it, vi } from "vitest";

import type { SignRecognizer, SignRecognitionListener } from "../core/SignRecognizer";
import type { SignRecognitionEvent } from "../types/events";
import { COMPETITIVE_RECOGNITION_SYMBOLS, RECOGNITION_CLASS_READINESS } from "../readiness/recognitionReadiness";
import { RecognitionGameController } from "./RecognitionGameController";

// 자모 이름을 하드코딩하지 않는다. 재측정으로 제외 목록이 바뀌면 계약에서 다시 뽑는다.
const ELIGIBLE = COMPETITIVE_RECOGNITION_SYMBOLS[0];
const QUARANTINED = RECOGNITION_CLASS_READINESS.find((item) => !item.competitiveEligible)?.symbol;

describe("RecognitionGameController model readiness", () => {
  it("does not spawn jamo classes that the deployed model cannot recognize reliably", () => {
    expect(ELIGIBLE).toBeTruthy();
    expect(QUARANTINED).toBeTruthy();

    // 모델이 지원한다고 알려 오더라도 계약에서 제외된 자모와 숫자는 걸러져야 한다.
    const supportedSymbols = [ELIGIBLE, QUARANTINED as string, "1"];
    const listeners = new Set<SignRecognitionListener>();
    const recognizer: SignRecognizer = {
      connect: async () => undefined,
      disconnect: () => undefined,
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      getSupportedSymbols: () => supportedSymbols,
      getConnectionState: () => "CONNECTED",
    };
    const setSpawnSymbols = vi.fn();
    const controller = new RecognitionGameController({
      submitSymbol: vi.fn(), releaseInput: vi.fn(), hasAvailableSymbol: () => true,
      getPreferredTargetSymbol: () => null, setSpawnSymbols, recordIncorrectInput: vi.fn(),
    });
    controller.attach(recognizer);
    controller.setMode("PYTHON_AI");

    const capabilities: SignRecognitionEvent = {
      type: "CAPABILITIES", modelVersion: "test", supportedSymbols, sequenceLength: 10,
    };
    listeners.forEach((listener) => listener(capabilities));

    expect(controller.getState().playableSymbols).toEqual([ELIGIBLE]);
    expect(setSpawnSymbols).toHaveBeenLastCalledWith([ELIGIBLE]);
    controller.detach();
  });
});
