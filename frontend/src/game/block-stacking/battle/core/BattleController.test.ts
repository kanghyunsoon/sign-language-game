import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockBattleTransport } from "../transport/MockBattleTransport";
import { LocalBattleBotTransport } from "../bot/LocalBattleBotTransport";
import { DEFAULT_BATTLE_SYNC_CONFIG } from "../sync/InterpolationConfig";
import { RemoteBoardReplica } from "../sync/RemoteBoardReplica";
import type { BattleLocalBoard } from "./BattleLocalBoardRuntime";
import type { SpawnLetterEvent } from "../transport/battleTransportTypes";
import type { LocalBoardPublisher } from "../sync/LocalBoardPublisher";
import { BattleController } from "./BattleController";
import type { SignRecognizer } from "../../../recognition/core/SignRecognizer";

class FakeBoard implements BattleLocalBoard {
  starts = 0; stops = 0; spawns: SpawnLetterEvent[] = []; accepted: string[] = []; rejected: (string | undefined)[] = []; selected: string | null = "letter-1"; disposed = false; gameOverHandler: (() => void) | null = null;
  start() { this.starts += 1; } stop() { this.stops += 1; } spawn(event: SpawnLetterEvent) { this.spawns.push(event); } selectRemoval() { return this.selected; }
  acceptRemoval(id: string) { this.accepted.push(id); } rejectRemoval(id?: string) { this.rejected.push(id); } getTargetSymbol() { return null; } takeTargetForOtter() { return null; } takeLetterForOtter() { return null; } resize() {} setPublisher(_publisher: LocalBoardPublisher) {} setGameOverHandler(handler: () => void) { this.gameOverHandler = handler; } dispose() { this.disposed = true; }
}
const attack = () => ({ apply: vi.fn(), dispose: vi.fn() });
const start = { type: "MATCH_STARTED" as const, sequence: 1, matchId: "m", roomId: "r", playerIds: ["me", "other"], startAt: 2000, serverTime: 1000 };
const spawn = (playerId: string): SpawnLetterEvent => ({ type: "SPAWN_LETTER", sequence: 2, matchId: "m", playerId, letterId: `letter-${playerId}`, spawnIndex: 0, symbol: "ㄱ", spawnAt: 2000, normalizedX: .5, initialAngle: 0 });

describe("BattleController", () => {
  beforeEach(() => vi.useFakeTimers());
  it("starts at the server startAt, not message receipt", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = new BattleController({ playerId: "me", roomId: "r", transport: t, localBoard: b, remoteBoard: new RemoteBoardReplica(DEFAULT_BATTLE_SYNC_CONFIG), attackEffect: attack() }); await c.connect({ url: "ws://x", roomId: "r", playerId: "me" }); t.emit(start); expect(c.snapshot().state).toBe("COUNTDOWN"); expect(b.starts).toBe(0); vi.advanceTimersByTime(999); expect(b.starts).toBe(0); vi.advanceTimersByTime(1); expect(b.starts).toBe(1); c.dispose(); });
  it("keeps an early match start received while the recognizer is connecting", async () => {
    const t = new MockBattleTransport(); const b = new FakeBoard(); let finishRecognizer!: () => void;
    const recognizer: SignRecognizer = { connect: () => new Promise<void>((resolve) => { finishRecognizer = resolve; }), disconnect() {}, subscribe: () => () => {}, getSupportedSymbols: () => [], getConnectionState: () => "CONNECTING" };
    const c = new BattleController({ playerId: "me", roomId: "r", transport: t, localBoard: b, remoteBoard: new RemoteBoardReplica(DEFAULT_BATTLE_SYNC_CONFIG), attackEffect: attack(), recognizer });
    const connecting = c.connect({ url: "ws://x", roomId: "r", playerId: "me" });
    t.emit(start); expect(c.snapshot().state).toBe("COUNTDOWN");
    finishRecognizer(); await connecting; expect(c.snapshot().state).toBe("COUNTDOWN");
    vi.advanceTimersByTime(1000); expect(c.snapshot().state).toBe("PLAYING"); expect(b.starts).toBe(1); c.dispose();
  });
  it("continues the match when the optional recognizer connection fails", async () => {
    const t = new MockBattleTransport(); const b = new FakeBoard();
    const recognizer: SignRecognizer = { connect: () => Promise.reject(new Error("AI offline")), disconnect() {}, subscribe: () => () => {}, getSupportedSymbols: () => [], getConnectionState: () => "ERROR" };
    const c = new BattleController({ playerId: "me", roomId: "r", transport: t, localBoard: b, remoteBoard: new RemoteBoardReplica(DEFAULT_BATTLE_SYNC_CONFIG), attackEffect: attack(), recognizer });
    await c.connect({ url: "ws://x", roomId: "r", playerId: "me" }); expect(c.snapshot().state).toBe("WAITING_START");
    t.emit(start); vi.advanceTimersByTime(1000); expect(c.snapshot().state).toBe("PLAYING"); expect(b.starts).toBe(1); c.dispose();
  });
  it("starts local bot practice even while the recognizer remains unavailable", async () => {
    const b = new FakeBoard(); const t = new LocalBattleBotTransport();
    const recognizer: SignRecognizer = { connect: () => new Promise<void>(() => undefined), disconnect() {}, subscribe: () => () => {}, getSupportedSymbols: () => [], getConnectionState: () => "CONNECTING" };
    const c = new BattleController({ playerId: "me", roomId: "block-bot-practice", transport: t, localBoard: b, remoteBoard: new RemoteBoardReplica(DEFAULT_BATTLE_SYNC_CONFIG), attackEffect: attack(), recognizer });
    void c.connect({ url: "local://block-bot", roomId: "block-bot-practice", playerId: "me" });
    vi.advanceTimersByTime(50); expect(c.snapshot().state).toBe("PLAYING"); expect(c.snapshot().countdownMs).toBe(0); expect(b.starts).toBe(1); c.dispose();
  });
  it("spawns only server-issued local letters", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = await connected(t, b); t.emit(spawn("other")); t.emit(spawn("me")); expect(b.spawns.map((e) => e.playerId)).toEqual(["me"]); c.dispose(); });
  it("sends a remove command without removing optimistically", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = await playing(t, b); expect(c.submitRecognizedSymbol("ㄱ", .9)).toBe(true); expect(t.sent.at(-1)?.type).toBe("REMOVE_LETTER_COMMAND"); expect(b.accepted).toHaveLength(0); c.dispose(); });
  it("removes only after server acceptance and uses official score", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = await playing(t, b); c.submitRecognizedSymbol("ㄱ"); t.emit({ type: "REMOVE_LETTER_ACCEPTED", sequence: 3, playerId: "me", letterId: "letter-1", symbol: "ㄱ", score: 300, combo: 2, maxCombo: 4, removedCount: 3, acceptedAt: Date.now() }); expect(b.accepted).toEqual(["letter-1"]); expect(c.snapshot()).toMatchObject({ score: 300, combo: 2, maxCombo: 4, removedCount: 3 }); c.dispose(); });
  it("releases a pending target after rejection", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = await playing(t, b); t.emit({ type: "REMOVE_LETTER_REJECTED", sequence: 4, letterId: "letter-1", code: "MISMATCH", message: "symbol mismatch", rejectedAt: Date.now() }); expect(b.rejected).toEqual(["letter-1"]); expect(c.snapshot().message).toBe("symbol mismatch"); c.dispose(); });
  it("does not send when recognized symbol is absent", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); b.selected = null; const c = await playing(t, b); const count = t.sent.length; expect(c.submitRecognizedSymbol("ㅅ")).toBe(false); expect(t.sent).toHaveLength(count); c.dispose(); });
  it("applies attacks only when the local player is target", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const effect = attack(); const c = await connected(t, b, effect); const event = { type: "ATTACK_CREATED" as const, sequence: 5, attackId: "a", attackerPlayerId: "other", targetPlayerId: "me", attackType: "PUSH", amount: 1, sourceCombo: 3, createdAt: Date.now() }; t.emit(event); expect(effect.apply).toHaveBeenCalledOnce(); t.emit({ ...event, sequence: 6, targetPlayerId: "other" }); expect(effect.apply).toHaveBeenCalledOnce(); c.dispose(); });
  it("cleans transport, board and effects", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const effect = attack(); const c = await connected(t, b, effect); c.dispose(); expect(t.getConnectionState()).toBe("DISCONNECTED"); expect(b.disposed).toBe(true); expect(effect.dispose).toHaveBeenCalledOnce(); });
  it("reconnects the same session and requests match state", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = await playing(t, b); t.simulateConnectionState("DISCONNECTED"); expect(c.snapshot().state).toBe("RECONNECTING"); expect(b.stops).toBe(1); await vi.advanceTimersByTimeAsync(1000); expect(t.connections).toHaveLength(2); expect(t.sent.slice(-2)).toEqual([expect.objectContaining({ type: "PLAYER_RECONNECTED", matchId: "m" }), expect.objectContaining({ type: "REQUEST_MATCH_STATE", matchId: "m" })]); c.dispose(); });
  it("returns to play only after a fresh opponent snapshot", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = await playing(t, b); t.simulateConnectionState("DISCONNECTED"); await vi.advanceTimersByTimeAsync(1000); expect(c.snapshot().state).toBe("RECONNECTING"); t.emit({ type: "BOARD_SNAPSHOT", sequence: 20, matchId: "m", playerId: "other", sentAt: Date.now(), bodies: [] }); expect(c.snapshot().state).toBe("PLAYING"); expect(b.starts).toBe(2); c.dispose(); });
  it("does not declare a local loss after the ten second grace", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = await playing(t, b); t.simulateConnectionState("DISCONNECTED"); await vi.advanceTimersByTimeAsync(10_000); expect(c.snapshot().state).toBe("RECONNECTING"); expect(c.snapshot().result).toBeNull(); expect(c.snapshot().message).toContain("official match result"); c.dispose(); });
  it("uses MATCH_FINISHED as the final result", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = await playing(t, b); t.emit({ type: "MATCH_FINISHED", sequence: 30, matchId: "m", winnerPlayerId: "other", loserPlayerId: "me", reason: "RECONNECT_TIMEOUT", finishedAt: Date.now(), results: [{ playerId: "me", score: 100, maxCombo: 2, removedCount: 1, attackCount: 0 }] }); expect(c.snapshot().state).toBe("FINISHED"); expect(c.snapshot().result?.winnerPlayerId).toBe("other"); c.dispose(); });
  it("reports local danger-line game over exactly once", async () => { const t = new MockBattleTransport(); const b = new FakeBoard(); const c = await playing(t, b); b.gameOverHandler?.(); b.gameOverHandler?.(); expect(t.sent.filter((message) => message.type === "PLAYER_GAME_OVER_COMMAND")).toHaveLength(1); c.dispose(); });
  it("uses a fresh match id and reset state for rematch", async () => { const ids: string[] = []; const firstTransport = new MockBattleTransport(); const first = new BattleController({ playerId: "me", roomId: "r", transport: firstTransport, localBoard: new FakeBoard(), remoteBoard: new RemoteBoardReplica(DEFAULT_BATTLE_SYNC_CONFIG), attackEffect: attack(), onMatchStarted: (id) => ids.push(id) }); await first.connect({ url: "ws://x", roomId: "r", playerId: "me" }); firstTransport.emit({ ...start, matchId: "match-1" }); first.dispose(); const secondTransport = new MockBattleTransport(); const second = new BattleController({ playerId: "me", roomId: "r", transport: secondTransport, localBoard: new FakeBoard(), remoteBoard: new RemoteBoardReplica(DEFAULT_BATTLE_SYNC_CONFIG), attackEffect: attack(), onMatchStarted: (id) => ids.push(id) }); await second.connect({ url: "ws://x", roomId: "r", playerId: "me" }); secondTransport.emit({ ...start, matchId: "match-2" }); expect(ids).toEqual(["match-1", "match-2"]); expect(second.snapshot()).toMatchObject({ score: 0, combo: 0, removedCount: 0, result: null }); second.dispose(); });
});

async function connected(t: MockBattleTransport, b: FakeBoard, effect = attack()) { const c = new BattleController({ playerId: "me", roomId: "r", transport: t, localBoard: b, remoteBoard: new RemoteBoardReplica(DEFAULT_BATTLE_SYNC_CONFIG), attackEffect: effect, createCommandId: () => "cmd" }); await c.connect({ url: "ws://x", roomId: "r", playerId: "me" }); return c; }
async function playing(t: MockBattleTransport, b: FakeBoard) { const c = await connected(t, b); t.emit({ ...start, startAt: 1000, serverTime: 1000 }); vi.runOnlyPendingTimers(); return c; }

