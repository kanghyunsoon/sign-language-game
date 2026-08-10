import { describe, expect, it, vi } from "vitest";

import type { SignRecognizer, SignRecognitionListener } from "../core/SignRecognizer";
import type { SignRecognitionEvent } from "../types/events";
import { RecognitionGameController } from "./RecognitionGameController";

describe("RecognitionGameController model readiness", () => {
  it("does not spawn jamo classes that the deployed model cannot recognize reliably", () => {
    const listeners = new Set<SignRecognitionListener>();
    const recognizer: SignRecognizer = {
      connect: async () => undefined,
      disconnect: () => undefined,
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      getSupportedSymbols: () => ["ㄱ", "ㅅ", "ㅠ", "1"],
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
      type: "CAPABILITIES", modelVersion: "test", supportedSymbols: ["ㄱ", "ㅅ", "ㅠ", "1"], sequenceLength: 10,
    };
    listeners.forEach((listener) => listener(capabilities));

    expect(controller.getState().playableSymbols).toEqual(["ㄱ"]);
    expect(setSpawnSymbols).toHaveBeenLastCalledWith(["ㄱ"]);
    controller.detach();
  });
});
