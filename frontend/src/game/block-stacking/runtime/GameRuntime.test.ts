import { describe, expect, it } from "vitest";

import type { PhysicsEvent, PhysicsLetterState, PhysicsWorld } from "../physics/types";
import type { GameRenderer } from "../render/types";
import { GameRuntime } from "./GameRuntime";

class FakePhysicsWorld implements PhysicsWorld {
  readonly states = new Map<string, PhysicsLetterState>();
  readonly queuedEvents: PhysicsEvent[] = [];
  readonly removedIds: string[] = [];
  resizedTo: { readonly width: number; readonly height: number } | null = null;

  createLetter(spec: { readonly id: string; readonly symbol: string; readonly x: number; readonly y: number }): PhysicsLetterState {
    const state: PhysicsLetterState = { ...spec, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: false };
    this.states.set(spec.id, state);
    return state;
  }
  update(): readonly PhysicsEvent[] { return this.queuedEvents.splice(0); }
  getLetterState(id: string): PhysicsLetterState | undefined { return this.states.get(id); }
  getLetterStates(): readonly PhysicsLetterState[] { return [...this.states.values()]; }
  removeLetter(id: string): boolean { this.removedIds.push(id); return this.states.delete(id); }
  resize(width: number, height: number): void { this.resizedTo = { width, height }; }
  clear(): void { this.states.clear(); }
  destroy(): void { this.clear(); }
}

class FakeRenderer implements GameRenderer {
  readonly highlightedIds: string[] = [];
  readonly finishedIds: string[] = [];
  readonly targetIds: Array<string | null> = [];
  render(): void {}
  resize(): void {}
  highlightRemoval(id: string): void { this.highlightedIds.push(id); }
  setTarget(id: string | null): void { this.targetIds.push(id); }
  updateEffects() { return this.finishedIds.splice(0).map((id) => ({ type: "REMOVAL_EFFECT_FINISHED" as const, id })); }
  clear(): void {}
  destroy(): void {}
}

function createRuntime(): { readonly runtime: GameRuntime; readonly world: FakePhysicsWorld; readonly renderer: FakeRenderer } {
  const world = new FakePhysicsWorld();
  const renderer = new FakeRenderer();
  return {
    world,
    renderer,
    runtime: new GameRuntime({
      physics: () => world,
      renderer,
      symbols: ["A"],
      now: () => 100,
      random: () => 0,
      soloConfig: { spawnIntervalMs: 1 },
      requestFrame: () => 1,
      cancelFrame: () => undefined,
    }),
  };
}

describe("GameRuntime", () => {
  it("selects a settled matching letter before a falling letter", () => {
    const { runtime, world, renderer } = createRuntime();
    runtime.start();
    runtime.advance(1);
    runtime.advance(1);
    world.queuedEvents.push({ type: "LETTER_SETTLED", id: "letter-2" });
    runtime.advance(1);
    runtime.submitSymbol("A");
    expect(renderer.highlightedIds).toEqual(["letter-2"]);
    runtime.dispose();
  });

  it("falls back to the oldest falling letter and prevents held-input duplicates", () => {
    const { runtime, world, renderer } = createRuntime();
    runtime.start();
    runtime.advance(1);
    runtime.advance(1);
    runtime.submitSymbol("A");
    runtime.submitSymbol("A");
    expect(renderer.highlightedIds).toEqual(["letter-1"]);
    expect(runtime.snapshot().lastMessage).toContain("locked");
    runtime.dispose();
  });

  it("highlights the oldest active letter as the board target", () => {
    const { runtime, renderer } = createRuntime();
    runtime.start();
    runtime.advance(1);
    runtime.advance(1);
    expect(renderer.targetIds.at(-1)).toBe("letter-1");
    runtime.submitSymbol("A");
    expect(renderer.targetIds.at(-1)).toBe("letter-2");
    runtime.dispose();
  });

  it("removes the body after the renderer effect and awards combo score", () => {
    const { runtime, world, renderer } = createRuntime();
    runtime.start();
    runtime.advance(1);
    runtime.submitSymbol("A");
    renderer.finishedIds.push("letter-1");
    runtime.advance(1);
    expect(world.removedIds).toEqual(["letter-1"]);
    expect(runtime.snapshot()).toMatchObject({ score: 100, combo: 1, removedCount: 1 });
    runtime.dispose();
  });

  it("ends the game only when a settled letter reaches the danger line", () => {
    const { runtime, world } = createRuntime();
    runtime.start();
    world.states.set("danger", { id: "danger", symbol: "A", x: 100, y: 180, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: true });
    runtime.advance(1);
    expect(runtime.snapshot().runState).toBe("GAME_OVER");
    runtime.dispose();
  });

  it("keeps the danger line at the same board ratio after resize", () => {
    const { runtime, world } = createRuntime();
    runtime.resizeViewport(640, 480);
    runtime.start();
    // Default danger ratio is 160 / 960. With a 480px board the line is 80px;
    // this block's top is 85px and must therefore remain playable.
    world.states.set("safe", { id: "safe", symbol: "A", x: 100, y: 155, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: true });
    runtime.advance(1);
    expect(runtime.snapshot().runState).toBe("RUNNING");
    world.states.set("danger", { id: "danger", symbol: "A", x: 200, y: 145, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: true });
    runtime.advance(1);
    expect(runtime.snapshot().runState).toBe("GAME_OVER");
    runtime.dispose();
  });

  it("records play time only while the game is running", () => {
    const { runtime } = createRuntime();
    runtime.start();
    runtime.advance(25);
    runtime.pause();
    runtime.advance(25);
    expect(runtime.snapshot().playTimeMs).toBe(25);
    runtime.dispose();
  });

  it("resizes the physics floor with the rendered viewport", () => {
    const { runtime, world } = createRuntime();
    runtime.resizeViewport(640, 800);
    expect(world.resizedTo).toEqual({ width: 640, height: 800 });
    runtime.dispose();
  });

  it("preserves the current viewport dimensions after restart", () => {
    const { runtime, world } = createRuntime();
    runtime.resizeViewport(640, 800);
    world.resizedTo = null;

    runtime.restart();

    expect(world.resizedTo).toEqual({ width: 640, height: 800 });
    runtime.dispose();
  });
});
