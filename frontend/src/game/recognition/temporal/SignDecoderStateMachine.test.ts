import { describe, expect, it } from "vitest";
import { SignDecoderStateMachine } from "./SignDecoderStateMachine";

describe("SignDecoderStateMachine", () => {
  it("accepts the recognition lifecycle and rejects invalid transitions", () => {
    const machine = new SignDecoderStateMachine();
    machine.transition("TRACKING"); machine.transition("MOVING"); machine.transition("CANDIDATE"); machine.transition("CONFIRMED"); machine.transition("RELEASE_WAIT");
    expect(machine.getState()).toBe("RELEASE_WAIT");
    expect(() => machine.transition("CONFIRMED")).toThrow(/Invalid sign decoder transition/);
  });
});
