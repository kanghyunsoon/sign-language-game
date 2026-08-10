import { describe, expect, it, vi } from "vitest";
import type { HandLandmarkFrame } from "../types/landmark";
import { DefaultLatestOnlyInferenceController } from "./LatestOnlyInferenceController";

const frame = (id: number, at: number): HandLandmarkFrame => ({
  frameId: id,
  capturedAt: at,
  handedness: "RIGHT",
  landmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
});

function timers() {
  let nextId = 0;
  const pending = new Map<number, { callback: () => void; delay: number }>();
  return {
    pending,
    setTimer: (callback: () => void, delay: number) => {
      const id = ++nextId;
      pending.set(id, { callback, delay });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (id: ReturnType<typeof setTimeout>) => pending.delete(id as unknown as number),
    runFirst: () => {
      const [id, timer] = pending.entries().next().value!;
      pending.delete(id);
      timer.callback();
      return timer.delay;
    },
  };
}

describe("DefaultLatestOnlyInferenceController", () => {
  it("keeps one in-flight request and only the newest pending frame", () => {
    let now = 1000;
    const clock = timers();
    const dispatch = vi.fn();
    const controller = new DefaultLatestOnlyInferenceController({
      inferenceFps: 10,
      dispatch,
      now: () => now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    });
    controller.start();
    controller.submit(frame(1, 1000));
    controller.submit(frame(2, 1001));
    controller.submit(frame(3, 1002));
    clock.runFirst();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0].frameId).toBe(3);

    controller.submit(frame(4, 1010));
    controller.submit(frame(5, 1020));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(controller.accept({ frameId: 3, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: 1020 })).toBe(true);
    now = 1100;
    clock.runFirst();
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1]![0].frameId).toBe(5);
  });

  it("ignores unknown, expired, repeated, and previous-session responses", () => {
    let now = 1000;
    const clock = timers();
    const controller = new DefaultLatestOnlyInferenceController({
      inferenceFps: 12,
      maximumPredictionAgeMs: 100,
      dispatch: vi.fn(),
      now: () => now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      createId: (() => { let id = 0; return () => `id-${++id}`; })(),
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.start();
    expect(controller.accept({ frameId: 99, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: 1000 })).toBe(false);
    controller.submit(frame(1, 1000));
    clock.runFirst();
    expect(controller.accept({ frameId: 1, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: 1000 })).toBe(true);
    expect(controller.accept({ frameId: 1, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: 1000 })).toBe(false);

    controller.submit(frame(2, 1000));
    clock.runFirst();
    now = 1200;
    expect(controller.accept({ frameId: 2, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: 1000 })).toBe(false);
    controller.stop();
    controller.start();
    expect(controller.accept({ frameId: 2, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: 1000 })).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("invalidates a late response when the active hand session changes", () => {
    const clock = timers();
    const dispatch = vi.fn();
    const controller = new DefaultLatestOnlyInferenceController({ inferenceFps: 12, dispatch, now: () => 1000, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    controller.start();
    controller.submit({ ...frame(10, 1000), activeHandSessionId: "session-a", activeHandId: "hand-a" });
    clock.runFirst();
    controller.submit({ ...frame(11, 1000), activeHandSessionId: "session-b", activeHandId: "hand-b" });
    clock.runFirst();
    expect(controller.accept({ frameId: 10, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: 1000 })).toBe(false);
    expect(controller.accept({ frameId: 11, symbol: "ㄴ", confidence: .9, isStable: false, predictedAt: 1000 })).toBe(true);
    expect(dispatch.mock.calls[1]![1]).toMatchObject({ sessionId: "session-b", activeHandId: "hand-b" });
  });

  it("starts response freshness when delayed landmarks are ready", () => {
    let now = 5000;
    const clock = timers();
    const dispatch = vi.fn();
    const controller = new DefaultLatestOnlyInferenceController({ inferenceFps: 12, maximumPredictionAgeMs: 100, dispatch, now: () => now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    controller.start();
    controller.submit(frame(7, 1000));
    clock.runFirst();
    expect(dispatch.mock.calls[0]![0].capturedAt).toBe(5000);
    now = 5001;
    expect(controller.accept({ frameId: 7, symbol: "ㄱ", confidence: .9, isStable: false, predictedAt: 5000 })).toBe(true);
  });
});
