import { describe, expect, it, vi } from "vitest";
import { createDevLineRaceScenario } from "../dev/createDevLineRaceScenario";

function scenario(overrides = {}) {
  let now = 0;
  const value = createDevLineRaceScenario(overrides, () => now);
  return { ...value, setNow: (next: number) => { now = next; } };
}

describe("LocalLineRaceRuntime", () => {
  it("starts IDLE and enters COUNTDOWN before automatic movement", () => {
    const { controller, runtime, setNow } = scenario();
    expect(runtime.getSnapshot().state).toBe("IDLE");
    controller.start();
    expect(runtime.getSnapshot().state).toBe("COUNTDOWN");
    expect(runtime.getSnapshot().remainingMs).toBe(60_000);
    setNow(2_999);
    runtime.update(2_999);
    expect(runtime.getSnapshot().players[0]?.progress).toBe(0);
  });

  it("moves both players independently after countdown", () => {
    const { controller, runtime, setNow } = scenario();
    controller.start();
    setNow(4_000);
    runtime.update(4_000);
    expect(runtime.getSnapshot().state).toBe("PLAYING");
    expect(runtime.getSnapshot().players.map((player) => player.progress)).toEqual([28, 28]);

    controller.applyPenalty("PLAYER_A", 1_500);
    setNow(5_500);
    runtime.update(5_500);
    expect(runtime.getSnapshot().players[0]?.progress).toBe(28);
    expect(runtime.getSnapshot().players[1]?.progress).toBe(70);
  });

  it("pauses logical time and resumes without a progress jump", () => {
    const { controller, runtime, setNow } = scenario();
    controller.start();
    setNow(4_000);
    runtime.update(4_000);
    controller.pause();
    expect(runtime.getSnapshot().state).toBe("PAUSED");
    setNow(6_000);
    runtime.update(6_000);
    expect(runtime.getSnapshot().players[0]?.progress).toBe(28);
    controller.resume();
    runtime.update(6_000);
    expect(runtime.getSnapshot().state).toBe("PLAYING");
    expect(runtime.getSnapshot().players[0]?.progress).toBe(28);
  });

  it("stops horizontal progress while traversing and resumes afterward", () => {
    const { controller, runtime, setNow } = scenario();
    controller.start();
    setNow(4_000);
    runtime.update(4_000);
    controller.startTraversing("PLAYER_A", 1_500);
    setNow(5_000);
    runtime.update(5_000);
    expect(runtime.getSnapshot().players[0]).toMatchObject({ progress: 28, state: "TRAVERSING", accumulatedPenaltyMs: 1_000 });
    setNow(5_500);
    runtime.update(5_500);
    expect(runtime.getSnapshot().players[0]).toMatchObject({ progress: 28, state: "RUNNING", accumulatedPenaltyMs: 1_500 });
    setNow(6_500);
    runtime.update(6_500);
    expect(runtime.getSnapshot().players[0]?.progress).toBe(56);
  });

  it("supports manual progress and finish-line decisions", () => {
    const { controller, runtime, setNow } = scenario({ raceLength: 150 });
    controller.start();
    setNow(3_000);
    runtime.update(3_000);
    controller.addProgress("PLAYER_A", 100);
    expect(runtime.getSnapshot().state).toBe("PLAYING");
    controller.addProgress("PLAYER_A", 100);
    expect(runtime.getSnapshot()).toMatchObject({ state: "FINISHED", winnerPlayerId: "PLAYER_A" });
  });

  it("uses progress, then penalty, then DRAW for time decisions", () => {
    const first = scenario();
    first.controller.start();
    first.setNow(4_000);
    first.runtime.update(4_000);
    first.controller.addProgress("PLAYER_A", 100);
    first.controller.finishByTime();
    expect(first.runtime.getSnapshot().winnerPlayerId).toBe("PLAYER_A");

    const second = scenario();
    second.controller.start();
    second.setNow(3_000);
    second.runtime.update(3_000);
    second.controller.applyPenalty("PLAYER_A", 500);
    second.controller.finishByTime();
    expect(second.runtime.getSnapshot().winnerPlayerId).toBe("PLAYER_B");

    const draw = scenario();
    draw.controller.start();
    draw.setNow(3_000);
    draw.runtime.update(3_000);
    draw.controller.finishByTime();
    expect(draw.runtime.getSnapshot().state).toBe("FINISHED");
    expect(draw.runtime.getSnapshot().winnerPlayerId).toBeUndefined();
  });

  it("finishes automatically at the configured time limit", () => {
    const { controller, runtime, setNow } = scenario({ raceLength: 100_000, matchDurationMs: 1_000 });
    controller.start();
    setNow(4_000);
    runtime.update(4_000);
    expect(runtime.getSnapshot()).toMatchObject({ state: "FINISHED", remainingMs: 0 });
  });

  it("resets all local state", () => {
    const { controller, runtime, setNow } = scenario();
    controller.start();
    setNow(4_000);
    runtime.update(4_000);
    controller.applyPenalty("PLAYER_A", 500);
    controller.reset();
    expect(runtime.getSnapshot()).toMatchObject({ state: "IDLE", remainingMs: 60_000 });
    expect(runtime.getSnapshot().players[0]).toMatchObject({ progress: 0, accumulatedPenaltyMs: 0 });
  });

  it("publishes snapshots and rejects use after dispose", () => {
    const { controller, runtime } = scenario();
    const listener = vi.fn();
    const unsubscribe = runtime.subscribe(listener);
    controller.start();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    runtime.dispose();
    expect(() => runtime.reset()).toThrow("disposed");
  });
});
