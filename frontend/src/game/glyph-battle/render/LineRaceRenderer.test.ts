// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const pixi = vi.hoisted(() => ({ applications: [] as Array<Record<string, any>> }));

vi.mock("pixi.js", () => {
  class FakePoint { set = vi.fn(); }
  class FakeContainer { position = new FakePoint(); scale = new FakePoint(); addChild = vi.fn(); destroy = vi.fn(); rotation = 0; visible = true; }
  class FakeGraphics extends FakeContainer {
    clear() { return this; } roundRect() { return this; } rect() { return this; }
    circle() { return this; } ellipse() { return this; } fill() { return this; } stroke() { return this; }
    moveTo() { return this; } lineTo() { return this; } bezierCurveTo() { return this; }
    arc() { return this; } closePath() { return this; }
  }
  class FakeText extends FakeContainer {
    anchor = new FakePoint(); text: string;
    constructor(options: { readonly text: string }) { super(); this.text = options.text; }
  }
  class FakeSprite extends FakeContainer { anchor = new FakePoint(); width = 0; height = 0; static from() { return new FakeSprite(); } }
  class FakeApplication {
    canvas = document.createElement("canvas"); stage = new FakeContainer();
    renderer = { resize: vi.fn() }; ticker = { add: vi.fn(), remove: vi.fn() };
    init = vi.fn(async () => undefined); start = vi.fn(); stop = vi.fn(); render = vi.fn(); destroy = vi.fn();
    constructor() { pixi.applications.push(this as unknown as Record<string, any>); }
  }
  return { Application: FakeApplication, Assets: { load: vi.fn(async () => undefined) }, Container: FakeContainer, Graphics: FakeGraphics, Sprite: FakeSprite, Text: FakeText };
});

import { DEFAULT_LINE_RACE_RUNTIME_CONFIG } from "../core";
import { LineRaceRenderer } from "./LineRaceRenderer";

beforeEach(() => {
  pixi.applications.length = 0;
});

describe("LineRaceRenderer lifecycle", () => {
  it("owns ticker, resize observer, canvas, and Pixi Application cleanup", async () => {
    const mount = document.createElement("div");
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    const renderer = await LineRaceRenderer.create(mount, DEFAULT_LINE_RACE_RUNTIME_CONFIG, {
      createResizeObserver: () => observer,
    });
    const app = pixi.applications[0]!;
    app.destroy.mockImplementation(() => { app.canvas = null; });
    expect(mount.querySelector("canvas")).toBe(app.canvas);
    expect(observer.observe).toHaveBeenCalledWith(mount);

    const frame = vi.fn();
    renderer.start(frame);
    expect(app.ticker.add).toHaveBeenCalledTimes(1);
    const tickerCallback = app.ticker.add.mock.calls[0]?.[0] as () => void;
    tickerCallback();
    expect(frame).toHaveBeenCalledTimes(1);

    renderer.resize(640, 420);
    expect(app.renderer.resize).toHaveBeenCalledWith(640, 420);
    renderer.destroy();
    renderer.destroy();
    renderer.destroy();
    expect(app.ticker.remove).toHaveBeenCalledTimes(1);
    expect(app.stop).toHaveBeenCalled();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    expect(app.destroy).toHaveBeenCalledTimes(1);
    expect(mount.childElementCount).toBe(0);
  });

  it("renders warning, falling, and traversal snapshots across resize", async () => {
    const mount = document.createElement("div");
    const renderer = await LineRaceRenderer.create(mount, DEFAULT_LINE_RACE_RUNTIME_CONFIG, {
      createResizeObserver: () => ({ observe: vi.fn(), disconnect: vi.fn() }),
    });
    const base = {
      state: "PLAYING" as const, now: 50, simulationNow: 50, remainingMs: 59_950,
      players: [
        { playerId: "PLAYER_A", progress: 180, state: "TRAVERSING" as const, accumulatedPenaltyMs: 50 },
        { playerId: "PLAYER_B", progress: 5, state: "RUNNING" as const, accumulatedPenaltyMs: 0 },
      ],
    };
    const obstacle = {
      obstacleId: "o1", templateId: "jamo-giyeok-v1", symbol: "ㄱ", targetPlayerId: "PLAYER_A",
      coursePosition: 180, state: "TRAVERSING" as const, penaltyMs: 100, fallDurationMs: 20,
      warningStartedAt: 0, warningEndsAt: 10, fallingStartedAt: 10, activatedAt: 30,
      traversalStartedAt: 0, traversalEndsAt: 100, fallProgress: 1, removalProgress: 0,
    };
    expect(() => renderer.render({ ...base, obstacles: [obstacle] })).not.toThrow();
    renderer.setObstacleFeedback({ obstacleId: "o1", state: "RECOGNIZING", progress: .5 });
    expect(() => renderer.render({ ...base, obstacles: [obstacle] })).not.toThrow();
    renderer.resize(720, 480);
    expect(() => renderer.render({ ...base, obstacles: [obstacle] })).not.toThrow();
    renderer.setPathDebugVisible(true);
    expect(() => renderer.render({ ...base, obstacles: [{ ...obstacle, state: "FALLING" as const, fallProgress: .5 }] })).not.toThrow();
    renderer.destroy();
  });

  it("does not remove a newer canvas when an older async renderer is destroyed", async () => {
    const mount = document.createElement("div");
    const options = { createResizeObserver: () => ({ observe: vi.fn(), disconnect: vi.fn() }) };
    const older = await LineRaceRenderer.create(mount, DEFAULT_LINE_RACE_RUNTIME_CONFIG, options);
    const olderCanvas = mount.querySelector("canvas");
    const newer = await LineRaceRenderer.create(mount, DEFAULT_LINE_RACE_RUNTIME_CONFIG, options);
    const newerCanvas = mount.querySelector("canvas");

    expect(newerCanvas).not.toBe(olderCanvas);
    older.destroy();
    expect(mount.querySelector("canvas")).toBe(newerCanvas);

    newer.destroy();
    expect(mount.querySelector("canvas")).toBeNull();
  });
});
