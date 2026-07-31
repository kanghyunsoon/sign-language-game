import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PhysicsWorld } from "../physics/types";
import type { GameRenderer } from "../render/types";
import { DefaultBattleAttackEffect } from "./attack/DefaultBattleAttackEffect";
import { LocalBattleBotTransport } from "./bot/LocalBattleBotTransport";
import { BattleController } from "./core/BattleController";
import { BattleLocalBoardRuntime } from "./core/BattleLocalBoardRuntime";
import { DEFAULT_BATTLE_RUNTIME_CONFIG } from "./core/BattleRuntimeConfig";
import { RemoteBoardReplica } from "./sync/RemoteBoardReplica";

describe("Battle bot practice runtime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("enters PLAYING and spawns the first local block in the browser runtime", async () => {
    const world = physics();
    vi.stubGlobal("requestAnimationFrame", function (this: unknown, _callback: FrameRequestCallback) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", function (this: unknown, _frame: number) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
    });
    const board = new BattleLocalBoardRuntime(world, renderer(), DEFAULT_BATTLE_RUNTIME_CONFIG);
    const controller = new BattleController({ playerId: "me", roomId: "block-bot-practice", transport: new LocalBattleBotTransport(), localBoard: board, remoteBoard: new RemoteBoardReplica(DEFAULT_BATTLE_RUNTIME_CONFIG.sync), attackEffect: new DefaultBattleAttackEffect() });

    await controller.connect({ url: "local://block-bot", roomId: "block-bot-practice", playerId: "me" });
    await vi.advanceTimersByTimeAsync(50);

    expect(controller.snapshot()).toMatchObject({ state: "PLAYING", countdownMs: 0 });
    expect(world.createLetter).toHaveBeenCalledOnce();
    controller.dispose();
  });

  it("finishes the bot match when the local settled pile reaches the danger line", async () => {
    const world = physics();
    let now = 0;
    vi.mocked(world.getLetterStates).mockReturnValue([{ id: "practice-local-0", symbol: "ㄱ", x: 200, y: 150, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: true }]);
    vi.mocked(world.update).mockReturnValueOnce([{ type: "LETTER_SETTLED", id: "practice-local-0" }]).mockReturnValue([]);
    const board = new BattleLocalBoardRuntime(world, renderer(), DEFAULT_BATTLE_RUNTIME_CONFIG, undefined, () => now, () => 1, () => undefined);
    const controller = new BattleController({ playerId: "me", roomId: "block-bot-practice", transport: new LocalBattleBotTransport(), localBoard: board, remoteBoard: new RemoteBoardReplica(DEFAULT_BATTLE_RUNTIME_CONFIG.sync), attackEffect: new DefaultBattleAttackEffect(), createCommandId: () => "game-over" });

    await controller.connect({ url: "local://block-bot", roomId: "block-bot-practice", playerId: "me" });
    await vi.advanceTimersByTimeAsync(50);
    now = 7_000;
    board.advance(17);
    now = 8_201;
    board.advance(17);

    expect(controller.snapshot()).toMatchObject({ state: "FINISHED", result: { reason: "DANGER_LINE", loserPlayerId: "me" } });
    controller.dispose();
  });
});

function physics(): PhysicsWorld {
  return { createLetter: vi.fn(() => ({ id: "letter", symbol: "ㄱ", x: 100, y: 100, angle: 0, velocityX: 0, velocityY: 0, angularVelocity: 0, settled: false })), resize: vi.fn(), update: vi.fn(() => []), getLetterState: vi.fn(), getLetterStates: vi.fn(() => []), removeLetter: vi.fn(() => false), clear: vi.fn(), destroy: vi.fn() };
}

function renderer(): GameRenderer {
  return { resize: vi.fn(), render: vi.fn(), highlightRemoval: vi.fn(), startSpawnEffect: vi.fn(), setTarget: vi.fn(), updateEffects: vi.fn(() => []), clear: vi.fn(), destroy: vi.fn() };
}
