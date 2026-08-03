import type { PhysicsLetterState, PhysicsWorld } from "../../physics/types";
import type { GameRenderer } from "../../render/types";
import type { BattleBodyTransform, SpawnLetterEvent } from "../transport/battleTransportTypes";
import type { LocalBoardPublisher } from "../sync/LocalBoardPublisher";
import { BATTLE_BURST_SPAWN_RATIO, BATTLE_LETTER_SIZE, type BattleRuntimeConfig } from "./BattleRuntimeConfig";

interface LetterRecord { readonly id: string; readonly symbol: string; readonly spawnedAt: number; dangerTouchedAt?: number; pending: boolean; }
const FIXED_PHYSICS_STEP_MS = 1000 / 60;
const MAX_CATCH_UP_STEPS = 4;
const DANGER_CONFIRMATION_MS = 1_200;
const SETTLED_BOARD_FRAME_INTERVAL_MS = 100;
// Hangul glyph masks do not occupy the full square physics box. Requiring the
// visible glyph body to cross farther than the box edge avoids a game-over
// while the rendered letter still appears just below the finish line.
const DANGER_VISIBLE_HALF_HEIGHT = BATTLE_LETTER_SIZE * .32;

export interface BattleLocalBoard {
  start(): void; stop(): void; reset(): void; spawn(event: SpawnLetterEvent): void; selectRemoval(symbol: string): string | null;
  acceptRemoval(letterId: string): void; rejectRemoval(letterId?: string): void; restore?(bodies: readonly BattleBodyTransform[], snapshotAt?: number, receivedAt?: number): void; getTargetSymbol(): string | null; takeTargetForOtter(): string | null; takeLetterForOtter(letterId: string): string | null; resize(width: number, height: number): void; setPublisher(publisher: LocalBoardPublisher): void; setGameOverHandler(handler: () => void): void; dispose(): void;
  removeLetter(letterId: string): boolean;
}

export class BattleLocalBoardRuntime implements BattleLocalBoard {
  private readonly letters = new Map<string, LetterRecord>(); private frame: number | null = null; private previousAt: number | null = null; private priorityTargetId: string | null = null;
  private width: number; private height: number; private running = false; private disposed = false; private publisher?: LocalBoardPublisher;
  private gameOverHandler: (() => void) | null = null; private gameOverReported = false; private dangerArmedAt: number | null = null;
  private physicsAccumulatorMs = 0;
  private hasMovingLetters = false;
  private lastSettledBoardFrameAt = Number.NEGATIVE_INFINITY;
  constructor(
    private readonly physics: PhysicsWorld,
    private readonly renderer: GameRenderer,
    private readonly config: BattleRuntimeConfig,
    publisher?: LocalBoardPublisher,
    private readonly now = () => performance.now(),
    private readonly requestFrame: (callback: FrameRequestCallback) => number = (callback) => globalThis.requestAnimationFrame(callback),
    private readonly cancelFrame: (frame: number) => void = (frame) => globalThis.cancelAnimationFrame(frame),
  ) { this.width = config.boardWidth; this.height = config.boardHeight; this.publisher = publisher; }
  start(): void { if (this.running || this.disposed) return; this.running = true; this.gameOverReported = false; this.dangerArmedAt = this.now(); this.previousAt = null; this.schedule(); }
  stop(): void { this.running = false; if (this.frame !== null) { this.cancelFrame(this.frame); this.frame = null; } }
  reset(): void {
    this.stop();
    for (const id of this.letters.keys()) this.physics.removeLetter(id);
    this.letters.clear();
    this.priorityTargetId = null;
    this.physicsAccumulatorMs = 0;
    this.hasMovingLetters = false;
    this.lastSettledBoardFrameAt = Number.NEGATIVE_INFINITY;
    this.gameOverReported = false;
    this.dangerArmedAt = null;
    this.renderer.setTarget(null);
    this.renderer.render([]);
  }
  spawn(event: SpawnLetterEvent): void {
    if (this.letters.has(event.letterId)) return;
    // Both players start every confirmed letter from the exact board center.
    // This makes the local and opponent Matter.js simulations share identical
    // initial conditions, without depending on streamed transform positions.
    const x = this.width / 2;
    this.physics.createLetter({
      id: event.letterId,
      symbol: event.symbol,
      x,
      // The authoritative physical body begins at the burst itself. There is
      // no second decorative glyph and no later duplicate drop from above.
      y: this.height * BATTLE_BURST_SPAWN_RATIO,
      angle: event.initialAngle,
      velocityY: 2.4,
    });
    this.letters.set(event.letterId, { id: event.letterId, symbol: event.symbol, spawnedAt: event.spawnAt, pending: false });
    this.hasMovingLetters = true;
    if (event.targetPriority) this.priorityTargetId = event.letterId;
    this.updateTarget();
  }
  selectRemoval(symbol: string): string | null {
    const target = this.currentTarget();
    if (!target || target.symbol !== symbol) return null;
    target.pending = true; this.renderer.setTarget(target.id); return target.id;
  }
  acceptRemoval(letterId: string): void { const record = this.letters.get(letterId); if (!record) return; if (this.priorityTargetId === letterId) this.priorityTargetId = null; this.renderer.highlightRemoval(letterId, this.config.removalEffectMs); this.updateTarget(); }
  rejectRemoval(letterId?: string): void { if (letterId) { const record = this.letters.get(letterId); if (record) record.pending = false; } else for (const record of this.letters.values()) record.pending = false; this.updateTarget(); }
  removeLetter(letterId: string): boolean {
    const record = this.letters.get(letterId);
    if (!record || !this.physics.removeLetter(letterId)) return false;
    if (this.priorityTargetId === letterId) this.priorityTargetId = null;
    this.letters.delete(letterId);
    // Removing a support can wake every block above it.
    this.hasMovingLetters = true;
    this.updateTarget();
    this.renderer.render(this.physics.getLetterStates());
    return true;
  }
  restore(bodies: readonly BattleBodyTransform[], snapshotAt = Date.now(), receivedAt = Date.now()): void {
    for (const body of bodies) {
      if (body.state === "REMOVED" || this.physics.getLetterState(body.id)) continue;
      const settled = body.state === "SETTLED";
      const saved = { id: body.id, symbol: body.symbol, x: body.x * this.width, y: body.y * this.height, angle: body.angle, velocityX: settled ? 0 : body.velocityX, velocityY: settled ? 0 : body.velocityY, angularVelocity: settled ? 0 : body.angularVelocity, settled };
      const state = this.physics.restoreLetter?.(saved) ?? this.physics.createLetter(saved);
      this.letters.set(body.id, { id: body.id, symbol: state.symbol, spawnedAt: 0, pending: false });
    }
    // Continue falling bodies from the authoritative capture point. Limit the
    // correction so clock skew or a suspended tab cannot fast-forward a whole
    // tower through multiple collisions in one restore.
    const correctionMs = Math.max(0, Math.min(FIXED_PHYSICS_STEP_MS * MAX_CATCH_UP_STEPS, receivedAt - snapshotAt));
    if (correctionMs > 0 && bodies.some((body) => body.state === "FALLING")) this.advancePhysics(correctionMs);
    this.hasMovingLetters = bodies.some((body) => body.state === "FALLING");
    this.updateTarget(); this.renderer.render(this.physics.getLetterStates());
  }
  getTargetSymbol(): string | null { return this.currentTarget()?.symbol ?? null; }
  /** 수달 이벤트가 현재 지정 블록 자체를 집어 갈 때 사용한다. */
  takeTargetForOtter(): string | null {
    const target = this.currentTarget();
    return target ? this.takeLetterForOtter(target.id) : null;
  }
  /** Removes the exact physical glyph selected by the authoritative transfer. */
  takeLetterForOtter(letterId: string): string | null {
    const target = this.letters.get(letterId);
    return target && this.removeLetter(letterId) ? target.symbol : null;
  }
  resize(_width: number, _height: number): void {
    // Battle physics always runs in the canonical board space. The renderer
    // projects those coordinates into the current DOM viewport, so browser
    // zoom and different panel sizes cannot move walls, the floor or bodies.
  }
  setPublisher(publisher: LocalBoardPublisher): void { this.publisher = publisher; }
  setGameOverHandler(handler: () => void): void { this.gameOverHandler = handler; }
  dispose(): void { if (this.disposed) return; this.stop(); this.physics.destroy(); this.letters.clear(); this.disposed = true; }
  advance(deltaMs: number): void {
    if (!this.running) return;
    const frameAt = this.now();
    if (!this.hasMovingLetters && !this.renderer.hasActiveEffects?.()) {
      if (frameAt - this.lastSettledBoardFrameAt < SETTLED_BOARD_FRAME_INTERVAL_MS) return;
      this.lastSettledBoardFrameAt = frameAt;
    }
    const bounded = Math.max(0, Math.min(FIXED_PHYSICS_STEP_MS * MAX_CATCH_UP_STEPS, deltaMs));
    this.advancePhysics(bounded);
    for (const event of this.renderer.updateEffects(bounded)) { if (this.physics.removeLetter(event.id)) { this.letters.delete(event.id); this.updateTarget(); } }
    const states = this.physics.getLetterStates();
    this.hasMovingLetters = states.some((state) => !state.settled);
    this.renderer.render(states); this.publisher?.update(Date.now(), states, this.width, this.height); this.checkDangerLine(states);
  }
  getStates(): readonly PhysicsLetterState[] { return this.physics.getLetterStates(); }
  private currentTarget(): LetterRecord | undefined { const priority = this.priorityTargetId ? this.letters.get(this.priorityTargetId) : undefined; if (priority && !priority.pending && this.physics.getLetterState(priority.id)) return priority; return [...this.letters.values()].filter((letter) => !letter.pending && this.physics.getLetterState(letter.id)).sort((left, right) => left.spawnedAt - right.spawnedAt)[0]; }
  private updateTarget(): void { this.renderer.setTarget(this.currentTarget()?.id ?? null); }
  private checkDangerLine(states: readonly PhysicsLetterState[]): void {
    if (this.gameOverReported || this.dangerArmedAt === null || this.now() < this.dangerArmedAt) return;
    const dangerLineY = this.height * this.config.dangerLineRatio;
    const now = this.now();
    const reached = states.some((state) => {
      const record = this.letters.get(state.id);
      if (!record) return false;
      // Start the confirmation at the exact moment that the visible glyph
      // reaches the finish line. Losing contact resets the timer, so a letter
      // which only bounces over the line cannot finish the round.
      if (state.y - DANGER_VISIBLE_HALF_HEIGHT > dangerLineY) {
        record.dangerTouchedAt = undefined;
        return false;
      }
      record.dangerTouchedAt ??= now;
      return now - record.dangerTouchedAt >= DANGER_CONFIRMATION_MS;
    });
    if (!reached) return;
    this.gameOverReported = true;
    this.stop();
    this.gameOverHandler?.();
  }
  private advancePhysics(deltaMs: number): void {
    this.physicsAccumulatorMs = Math.min(
      this.physicsAccumulatorMs + deltaMs,
      FIXED_PHYSICS_STEP_MS * MAX_CATCH_UP_STEPS,
    );
    while (this.physicsAccumulatorMs + .001 >= FIXED_PHYSICS_STEP_MS) {
      this.physics.update(FIXED_PHYSICS_STEP_MS);
      this.physicsAccumulatorMs -= FIXED_PHYSICS_STEP_MS;
    }
  }
  private schedule(): void { this.frame = this.requestFrame((at) => { this.frame = null; const delta = this.previousAt === null ? 1000 / 60 : at - this.previousAt; this.previousAt = at; this.advance(delta); if (this.running) this.schedule(); }); }
}
