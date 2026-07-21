import { describe, expect, it } from "vitest";
import { BattleStateMachine } from "./BattleStateMachine";
describe("BattleStateMachine", () => {
  it("follows the normal match lifecycle", () => { const machine = new BattleStateMachine(); machine.transition("CONNECTING"); machine.transition("WAITING_START"); machine.transition("COUNTDOWN"); machine.transition("PLAYING"); expect(machine.transition("FINISHED")).toBe("FINISHED"); });
  it("rejects starting before a server countdown", () => { expect(() => new BattleStateMachine().transition("PLAYING")).toThrow("Invalid battle transition"); });
  it("supports reconnecting to play", () => { const machine = new BattleStateMachine("PLAYING"); machine.transition("RECONNECTING"); expect(machine.transition("PLAYING")).toBe("PLAYING"); });
});

