import { afterEach, describe, expect, it, vi } from "vitest";
import type { PhysicsWorld } from "../../physics/types";
import type { GameRenderer } from "../../render/types";
import { BattleLocalBoardRuntime } from "./BattleLocalBoardRuntime";
import { DEFAULT_BATTLE_RUNTIME_CONFIG } from "./BattleRuntimeConfig";

describe("BattleLocalBoardRuntime", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls browser animation frame APIs with the global receiver", () => {
    let scheduled: FrameRequestCallback | null = null;
    const requestFrame = vi.fn(function (this: unknown, callback: FrameRequestCallback) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      scheduled = callback;
      return 7;
    });
    const cancelFrame = vi.fn(function (this: unknown, _frame: number) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
    });
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);

    const runtime = new BattleLocalBoardRuntime(physics(), renderer(), DEFAULT_BATTLE_RUNTIME_CONFIG);
    expect(() => runtime.start()).not.toThrow();
    expect(scheduled).toEqual(expect.any(Function));
    expect(() => runtime.stop()).not.toThrow();
    expect(cancelFrame).toHaveBeenCalledWith(7);
  });

  it("restores an existing tower as fixed blocks without replaying its fall", () => {
    const world = physics();
    const restored = vi.fn((spec) => letterState(spec.id, spec.symbol, spec.x, spec.y));
    (world as PhysicsWorld & { restoreLetter: typeof restored }).restoreLetter = restored;
    const runtime = new BattleLocalBoardRuntime(world, renderer(), DEFAULT_BATTLE_RUNTIME_CONFIG);

    runtime.restore([{ id: "saved", symbol: "ㄱ", x: .4, y: .75, angle: .3, velocityX: 18, velocityY: -12, angularVelocity: .2, state: "FALLING" }]);

    expect(restored).toHaveBeenCalledWith(expect.objectContaining({
      id: "saved", x: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth * .4, y: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight * .75,
      velocityX: 0, velocityY: 0, angularVelocity: 0, settled: true,
    }));
  });

  it("allows removal of only the currently designated oldest block", () => {
    const states = new Map<string, { readonly id: string; readonly symbol: string; readonly x: number; readonly y: number; readonly angle: number; readonly velocityX: number; readonly velocityY: number; readonly angularVelocity: number; readonly settled: boolean }>();
    const world = physics();
    vi.mocked(world.createLetter).mockImplementation((spec) => { const state = { id: spec.id, symbol: spec.symbol, x: spec.x, y: spec.y, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: false }; states.set(spec.id, state); return state; });
    vi.mocked(world.getLetterState).mockImplementation((id) => states.get(id));
    vi.mocked(world.getLetterStates).mockImplementation(() => [...states.values()]);
    const view = renderer();
    const runtime = new BattleLocalBoardRuntime(world, view, DEFAULT_BATTLE_RUNTIME_CONFIG, undefined, () => 0, () => 1, () => undefined);
    runtime.spawn(spawn("first", "ㄱ", 1)); runtime.spawn(spawn("second", "ㄴ", 2));

    expect(runtime.getTargetSymbol()).toBe("ㄱ");
    expect(runtime.selectRemoval("ㄴ")).toBeNull();
    expect(runtime.selectRemoval("ㄱ")).toBe("first");
    runtime.acceptRemoval("first");
    expect(runtime.getTargetSymbol()).toBe("ㄴ");
    expect(view.setTarget).toHaveBeenLastCalledWith("second");
  });

  it("spawns every confirmed letter at the board center", () => {
    const states = new Map<string, ReturnType<typeof letterState>>();
    const world = physics();
    vi.mocked(world.createLetter).mockImplementation((spec) => { const state = letterState(spec.id, spec.symbol, spec.x, 500); states.set(spec.id, state); return state; });
    vi.mocked(world.getLetterState).mockImplementation((id) => states.get(id));
    vi.mocked(world.getLetterStates).mockImplementation(() => [...states.values()]);
    const runtime = new BattleLocalBoardRuntime(world, renderer(), DEFAULT_BATTLE_RUNTIME_CONFIG, undefined, () => 0, () => 1, () => undefined);

    runtime.spawn(spawn("first", "ㄱ", 1));
    runtime.spawn(spawn("second", "ㄴ", 2));
    runtime.spawn(spawn("third", "ㄷ", 3));

    const xs = vi.mocked(world.createLetter).mock.calls.map(([spec]) => spec.x);
    expect(xs).toEqual([360, 360, 360]);
  });

  it("picks up exactly the letter selected for the otter and promotes the next target", () => {
    const states = new Map<string, ReturnType<typeof letterState>>();
    const world = physics();
    vi.mocked(world.createLetter).mockImplementation((spec) => { const state = letterState(spec.id, spec.symbol, spec.x, spec.y); states.set(spec.id, state); return state; });
    vi.mocked(world.getLetterState).mockImplementation((id) => states.get(id));
    vi.mocked(world.getLetterStates).mockImplementation(() => [...states.values()]);
    vi.mocked(world.removeLetter).mockImplementation((id) => states.delete(id));
    const runtime = new BattleLocalBoardRuntime(world, renderer(), DEFAULT_BATTLE_RUNTIME_CONFIG, undefined, () => 0, () => 1, () => undefined);
    runtime.spawn(spawn("first", "ㄱ", 1)); runtime.spawn(spawn("second", "ㄴ", 2));

    expect(runtime.takeLetterForOtter("second")).toBe("ㄴ");
    expect(world.removeLetter).toHaveBeenCalledWith("second");
    expect(runtime.getTargetSymbol()).toBe("ㄱ");
    expect(runtime.takeLetterForOtter("missing")).toBeNull();
  });

  it("keeps an otter-thrown priority letter at the board center", () => {
    const world = physics();
    const states = new Map<string, ReturnType<typeof letterState>>();
    vi.mocked(world.createLetter).mockImplementation((spec) => { const state = letterState(spec.id, spec.symbol, spec.x, spec.y); states.set(spec.id, state); return state; });
    vi.mocked(world.getLetterState).mockImplementation((id) => states.get(id));
    const runtime = new BattleLocalBoardRuntime(world, renderer(), DEFAULT_BATTLE_RUNTIME_CONFIG, undefined, () => 0, () => 1, () => undefined);
    runtime.spawn({ ...spawn("thrown", "ㄷ", 1), normalizedX: .72, targetPriority: true });

    expect(vi.mocked(world.createLetter).mock.calls[0]?.[0].x).toBeCloseTo(DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth / 2);
    expect(runtime.getTargetSymbol()).toBe("ㄷ");
  });

  it("reports game over once when a settled block crosses the proportional danger line", () => {
    let now = 0;
    const states = new Map<string, ReturnType<typeof letterState>>();
    const world = physics();
    vi.mocked(world.createLetter).mockImplementation((spec) => { const state = letterState(spec.id, spec.symbol, spec.x, 180); states.set(spec.id, state); return state; });
    vi.mocked(world.getLetterState).mockImplementation((id) => states.get(id));
    vi.mocked(world.getLetterStates).mockImplementation(() => [...states.values()]);
    const runtime = new BattleLocalBoardRuntime(world, renderer(), DEFAULT_BATTLE_RUNTIME_CONFIG, undefined, () => now, () => 1, () => undefined);
    runtime.spawn(spawn("danger", "ㄱ", 1));
    vi.mocked(world.update).mockReturnValue([{ type: "LETTER_SETTLED", id: "danger" }]);
    const handler = vi.fn(); runtime.setGameOverHandler(handler); runtime.start();
    runtime.advance(16); now = 751; vi.mocked(world.update).mockReturnValue([]); runtime.advance(16);
    expect(handler).not.toHaveBeenCalled();
    now = 6_751; runtime.advance(16);
    expect(handler).toHaveBeenCalledOnce();
  });
});

function spawn(id: string, symbol: string, spawnAt: number) {
  return { type: "SPAWN_LETTER" as const, sequence: spawnAt, matchId: "match", playerId: "me", letterId: id, spawnIndex: spawnAt, symbol, spawnAt, normalizedX: .5, initialAngle: 0 };
}

function physics(): PhysicsWorld {
  return { createLetter: vi.fn(), resize: vi.fn(), update: vi.fn(() => []), getLetterState: vi.fn(), getLetterStates: vi.fn(() => []), removeLetter: vi.fn(() => false), clear: vi.fn(), destroy: vi.fn() } as unknown as PhysicsWorld;
}

function renderer(): GameRenderer {
  return { resize: vi.fn(), render: vi.fn(), highlightRemoval: vi.fn(), startSpawnEffect: vi.fn(), setTarget: vi.fn(), updateEffects: vi.fn(() => []), clear: vi.fn(), destroy: vi.fn() };
}

function letterState(id: string, symbol: string, x: number, y: number) {
  return { id, symbol, x, y, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: true };
}
