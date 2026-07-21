import { describe, expect, it, vi } from "vitest";
import { KeyboardSignRecognizer, type SignRecognizer, type SignRecognitionListener } from "../../recognition";
import type { RecognitionConnectionState } from "../../recognition";
import { DefaultLineRaceInputResolver } from "./LineRaceInputResolver";
import { LineRaceSignInputController } from "./LineRaceSignInputController";
import type { LineRaceInputContext } from "./LineRaceInputContext";
import type { LocalLineRaceCommandGateway } from "../transport";

class FakeRecognizer implements SignRecognizer {
  listeners = new Set<SignRecognitionListener>(); state: RecognitionConnectionState = "DISCONNECTED";
  connect = vi.fn(async () => { this.state = "CONNECTED"; this.emit({ type: "CONNECTION_STATE", state: "CONNECTED", changedAt: 1 }); });
  disconnect = vi.fn(() => { this.state = "DISCONNECTED"; });
  subscribe(listener: SignRecognitionListener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  getSupportedSymbols() { return ["ㄱ", "ㄴ"]; } getConnectionState() { return this.state; }
  emit(event: Parameters<SignRecognitionListener>[0]) { this.listeners.forEach((listener) => listener(event)); }
}

const context: LineRaceInputContext = { matchState: "PLAYING", attackHand: ["ㄱ", "ㄴ"], attackCooldownEndsAt: 0, now: 100,
  pendingObstacleCount: 0, maxPendingObstacles: 6, supportedSymbols: ["ㄱ", "ㄴ"], counterableObstacles: [] };

describe("LineRaceSignInputController", () => {
  it("keeps camera input locked until the hand is actually lowered", async () => {
    const recognizer = new FakeRecognizer(); const attack = vi.fn(async () => undefined);
    const gateway: LocalLineRaceCommandGateway = { submitAttack: attack, submitCounter: vi.fn(async () => undefined) };
    const controller = new LineRaceSignInputController({ recognizer, resolver: new DefaultLineRaceInputResolver(), gateway, getContext: () => context, createCommandId: () => `c-${attack.mock.calls.length}` });
    await controller.connect();
    const confirm = (symbol: string) => recognizer.emit({ type: "SIGN_CONFIRMED", symbol, confidence: 1, confirmedAt: 100, modelVersion: "test" });
    confirm("ㄱ"); confirm("ㄱ");
    await Promise.resolve(); expect(attack).toHaveBeenCalledTimes(1);
    recognizer.emit({ type: "HAND_RELEASED", releasedAt: 101 }); confirm("ㄱ"); confirm("ㄴ");
    await Promise.resolve(); expect(attack).toHaveBeenCalledTimes(1);
    controller.notifyHandNotDetected(200);controller.notifyHandNotDetected(520);confirm("ㄴ");
    await Promise.resolve(); expect(attack).toHaveBeenCalledTimes(2);
    controller.dispose(); expect(recognizer.listeners.size).toBe(0); expect(recognizer.disconnect).toHaveBeenCalled();
  });

  it("routes keyboard confirmation through resolver and gateway", async () => {
    const primary = new FakeRecognizer(); const keyboard = new KeyboardSignRecognizer({ supportedSymbols: ["ㄱ"] });
    const attack = vi.fn(async () => undefined); const gateway: LocalLineRaceCommandGateway = { submitAttack: attack, submitCounter: vi.fn(async () => undefined) };
    const controller = new LineRaceSignInputController({ recognizer: primary, keyboardRecognizer: keyboard, resolver: new DefaultLineRaceInputResolver(), gateway, getContext: () => context });
    await controller.connect(); keyboard.confirmSymbol("ㄱ"); await Promise.resolve();
    expect(attack).toHaveBeenCalledTimes(1); controller.dispose();
  });

  it("surfaces connection and gateway failures without throwing into the game loop", async () => {
    const recognizer = new FakeRecognizer(); recognizer.connect.mockRejectedValueOnce(new Error("AI unavailable"));
    const gateway: LocalLineRaceCommandGateway = { submitAttack: vi.fn(async () => { throw new Error("gateway failed"); }), submitCounter: vi.fn(async () => undefined) };
    const controller = new LineRaceSignInputController({ recognizer, resolver: new DefaultLineRaceInputResolver(), gateway, getContext: () => context });
    await controller.connect(); expect(controller.getState().error).toBe("AI unavailable");
    recognizer.emit({ type: "SIGN_CONFIRMED", symbol: "ㄱ", confidence: 1, confirmedAt: 100, modelVersion: "test" });
    await Promise.resolve(); await Promise.resolve(); expect(controller.getState().error).toBe("gateway failed");
  });

  it("emits recognized and pending events but waits for server authority before success", async () => {
    const recognizer = new FakeRecognizer();
    const actions = vi.fn();
    const gateway: LocalLineRaceCommandGateway = {
      resultAuthority: "SERVER",
      submitAttack: vi.fn(async () => undefined),
      submitCounter: vi.fn(async () => undefined),
    };
    const controller = new LineRaceSignInputController({ recognizer, resolver: new DefaultLineRaceInputResolver(), gateway,
      getContext: () => context, createCommandId: () => "server-command", onActionFeedback: actions });
    await controller.connect();
    const event = { type: "SIGN_CONFIRMED" as const, symbol: "ㄱ", confidence: 1, confirmedAt: 100, modelVersion: "test" };
    recognizer.emit(event); recognizer.emit(event);
    await Promise.resolve();
    expect(actions.mock.calls.map(([action]) => action.type)).toEqual(["ATTACK_RECOGNIZED", "ATTACK_SENT", "RELEASE_REQUIRED"]);
    expect(actions).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ATTACK_SUCCEEDED" }));
    expect(gateway.submitAttack).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("fills the short selection charge before it submits a confirmed sign", async () => {
    vi.useFakeTimers();
    const recognizer = new FakeRecognizer(); const attack = vi.fn(async () => undefined);
    const gateway: LocalLineRaceCommandGateway = { submitAttack: attack, submitCounter: vi.fn(async () => undefined) };
    const controller = new LineRaceSignInputController({ recognizer, resolver: new DefaultLineRaceInputResolver(), gateway, getContext: () => context, selectionChargeMs: 520 });
    await controller.connect();
    recognizer.emit({ type: "SIGN_CONFIRMED", symbol: "ㄱ", confidence: 1, confirmedAt: 100, modelVersion: "test" });
    expect(controller.getState().chargingSelection).toMatchObject({ symbol: "ㄱ", completesAt: 620 });
    await vi.advanceTimersByTimeAsync(519); expect(attack).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(attack).toHaveBeenCalledTimes(1); expect(controller.getState().chargingSelection).toBeNull();
    controller.dispose(); vi.useRealTimers();
  });
});
