import type { PhysicsLetterState, PhysicsWorld } from "../../physics/types";
import type { GameRenderer } from "../../render/types";
import type { SpawnLetterEvent } from "../transport/battleTransportTypes";
import type { LocalBoardPublisher } from "../sync/LocalBoardPublisher";
import { BATTLE_LETTER_SIZE, type BattleRuntimeConfig } from "./BattleRuntimeConfig";
import { chooseDistributedSpawnX } from "../../runtime/DistributedSpawnPolicy";

interface LetterRecord { readonly id: string; readonly symbol: string; readonly spawnedAt: number; settledAt?: number; pending: boolean; }

export interface BattleLocalBoard {
  start(): void; stop(): void; spawn(event: SpawnLetterEvent): void; selectRemoval(symbol: string): string | null;
  acceptRemoval(letterId: string): void; rejectRemoval(letterId?: string): void; getTargetSymbol(): string | null; takeTargetForOtter(): string | null; resize(width: number, height: number): void; setPublisher(publisher: LocalBoardPublisher): void; setGameOverHandler(handler: () => void): void; dispose(): void;
}

export class BattleLocalBoardRuntime implements BattleLocalBoard {
  private readonly letters = new Map<string, LetterRecord>(); private frame: number | null = null; private previousAt: number | null = null; private priorityTargetId: string | null = null;
  private width: number; private height: number; private running = false; private disposed = false; private publisher?: LocalBoardPublisher;
  private gameOverHandler: (() => void) | null = null; private gameOverReported = false;
  constructor(
    private readonly physics: PhysicsWorld,
    private readonly renderer: GameRenderer,
    private readonly config: BattleRuntimeConfig,
    publisher?: LocalBoardPublisher,
    private readonly now = () => performance.now(),
    private readonly requestFrame: (callback: FrameRequestCallback) => number = (callback) => globalThis.requestAnimationFrame(callback),
    private readonly cancelFrame: (frame: number) => void = (frame) => globalThis.cancelAnimationFrame(frame),
  ) { this.width = config.boardWidth; this.height = config.boardHeight; this.publisher = publisher; }
  start(): void { if (this.running || this.disposed) return; this.running = true; this.previousAt = null; this.schedule(); }
  stop(): void { this.running = false; if (this.frame !== null) { this.cancelFrame(this.frame); this.frame = null; } }
  spawn(event: SpawnLetterEvent): void { if (this.letters.has(event.letterId)) return; const x = chooseDistributedSpawnX(this.physics.getLetterStates(), this.width, this.height, BATTLE_LETTER_SIZE, event.normalizedX); this.physics.createLetter({ id: event.letterId, symbol: event.symbol, x, y: Math.max(-70, -Math.min(this.width, this.height) * .12), angle: event.initialAngle }); this.letters.set(event.letterId, { id: event.letterId, symbol: event.symbol, spawnedAt: event.spawnAt, pending: false }); if (event.targetPriority) this.priorityTargetId = event.letterId; this.updateTarget(); }
  selectRemoval(symbol: string): string | null {
    const target = this.currentTarget();
    if (!target || target.symbol !== symbol) return null;
    target.pending = true; this.renderer.setTarget(target.id); return target.id;
  }
  acceptRemoval(letterId: string): void { const record = this.letters.get(letterId); if (!record) return; if (this.priorityTargetId === letterId) this.priorityTargetId = null; this.renderer.highlightRemoval(letterId, this.config.removalEffectMs); this.updateTarget(); }
  rejectRemoval(letterId?: string): void { if (letterId) { const record = this.letters.get(letterId); if (record) record.pending = false; } else for (const record of this.letters.values()) record.pending = false; this.updateTarget(); }
  getTargetSymbol(): string | null { return this.currentTarget()?.symbol ?? null; }
  /** 수달 이벤트가 현재 지정 블록 자체를 집어 갈 때 사용한다. */
  takeTargetForOtter(): string | null {
    const target = this.currentTarget();
    if (!target) return null;
    this.physics.removeLetter(target.id);
    this.letters.delete(target.id);
    this.updateTarget();
    this.renderer.render(this.physics.getLetterStates());
    return target.symbol;
  }
  resize(width: number, height: number): void { this.width = width; this.height = height; this.physics.resize(width, height); }
  setPublisher(publisher: LocalBoardPublisher): void { this.publisher = publisher; }
  setGameOverHandler(handler: () => void): void { this.gameOverHandler = handler; }
  dispose(): void { if (this.disposed) return; this.stop(); this.physics.destroy(); this.letters.clear(); this.disposed = true; }
  advance(deltaMs: number): void {
    if (!this.running) return; const bounded = Math.max(1, Math.min(32, deltaMs));
    for (const event of this.physics.update(bounded)) { const record = this.letters.get(event.id); if (record && event.type === "LETTER_SETTLED") record.settledAt = this.now(); if (record && event.type === "LETTER_MOVED") record.settledAt = undefined; }
    for (const event of this.renderer.updateEffects(bounded)) { if (this.physics.removeLetter(event.id)) { this.letters.delete(event.id); this.updateTarget(); } }
    const states = this.physics.getLetterStates(); this.renderer.render(states); this.publisher?.update(Date.now(), states, this.width, this.height); this.checkDangerLine(states);
  }
  getStates(): readonly PhysicsLetterState[] { return this.physics.getLetterStates(); }
  private currentTarget(): LetterRecord | undefined { const priority = this.priorityTargetId ? this.letters.get(this.priorityTargetId) : undefined; if (priority && !priority.pending && this.physics.getLetterState(priority.id)) return priority; return [...this.letters.values()].filter((letter) => !letter.pending && this.physics.getLetterState(letter.id)).sort((left, right) => left.spawnedAt - right.spawnedAt)[0]; }
  private updateTarget(): void { this.renderer.setTarget(this.currentTarget()?.id ?? null); }
  private checkDangerLine(states: readonly PhysicsLetterState[]): void {
    if (this.gameOverReported) return;
    const dangerLineY = this.height * this.config.dangerLineRatio;
    const reached = states.some((state) => state.settled && state.y - BATTLE_LETTER_SIZE / 2 <= dangerLineY);
    if (!reached) return;
    this.gameOverReported = true;
    this.stop();
    this.gameOverHandler?.();
  }
  private schedule(): void { this.frame = this.requestFrame((at) => { this.frame = null; const delta = this.previousAt === null ? 1000 / 60 : at - this.previousAt; this.previousAt = at; this.advance(delta); if (this.running) this.schedule(); }); }
}
