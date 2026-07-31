import { MatterPhysicsWorld } from "../../physics/MatterPhysicsWorld";
import { DEFAULT_PHYSICS_CONFIG, type PhysicsLetterState } from "../../physics/types";
import { BATTLE_BURST_SPAWN_RATIO, BATTLE_LETTER_SIZE, DEFAULT_BATTLE_RUNTIME_CONFIG } from "../core/BattleRuntimeConfig";
import type { BattleBodyTransform, SpawnLetterEvent } from "../transport/battleTransportTypes";
import type { RemoteBoard, RemoteSyncMessage } from "./RemoteBoardReplica";

const FIXED_PHYSICS_STEP_MS = 1000 / 60;
const MAX_CATCH_UP_STEPS = 4;

/**
 * Renders an opponent's confirmed block locally instead of replaying their
 * streamed transform packets.  Network jitter therefore cannot affect the
 * falling animation: SPAWN_LETTER is the only input needed while playing.
 */
export class RemotePhysicsBoard implements RemoteBoard {
  private readonly physics = new MatterPhysicsWorld({
    ...DEFAULT_PHYSICS_CONFIG,
    width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth,
    height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight,
    letterWidth: BATTLE_LETTER_SIZE,
    letterHeight: BATTLE_LETTER_SIZE,
    letterColliderPadding: 1,
    gravityY: 0.48,
    maxFallSpeed: 7,
    friction: 0.14,
    frictionAir: 0.0045,
    restitution: 0.035,
    rotationInertiaScale: 0.68,
    settleDurationMs: 550,
    linearVelocityThreshold: 0.045,
    angularVelocityThreshold: 0.006,
    freezeSettledBodies: true,
  });
  private readonly symbols = new Map<string, string>();
  private readonly authoritativeSettledIds = new Set<string>();
  private width = DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth;
  private height = DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight;
  private previousAt: number | null = null;
  private physicsAccumulatorMs = 0;

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.physics.resize(width, height);
  }

  spawn(event: SpawnLetterEvent, _receivedAt: number): boolean {
    if (this.physics.getLetterState(event.letterId)) return false;
    this.createCenteredLetter(event.letterId, event.symbol, event.initialAngle);
    return true;
  }

  apply(message: RemoteSyncMessage, receivedAt: number): boolean {
    if (message.type === "LETTER_REMOVED_SYNC" || (message.type === "LETTER_STATE_SYNC" && message.state === "REMOVED")) {
      this.remove(message.letterId);
      return true;
    }
    if (message.type === "BOARD_SNAPSHOT") {
      const activeIds = new Set(message.bodies.filter((body) => body.state !== "REMOVED").map((body) => body.id));
      for (const id of [...this.symbols.keys()]) if (!activeIds.has(id)) this.remove(id);
      let restoredFallingLetter = false;
      for (const body of message.bodies) {
        if (body.state === "REMOVED") continue;
        if (!this.physics.getLetterState(body.id)) {
          this.restoreSnapshotLetter(body);
          restoredFallingLetter ||= body.state === "FALLING";
        } else if (body.state === "SETTLED" && !this.authoritativeSettledIds.has(body.id)) {
          // Correct each final body once. Reapplying the same snapshot every
          // interval made stable letters visibly blink between simulations.
          this.synchronizeSettledLetter(body);
        }
      }
      const correctionMs = Math.max(0, Math.min(FIXED_PHYSICS_STEP_MS * MAX_CATCH_UP_STEPS, receivedAt - message.sentAt));
      if (restoredFallingLetter && correctionMs > 0) this.advancePhysics(correctionMs);
      return true;
    }
    if (message.type === "LETTER_SPAWNED_SYNC") {
      if (!this.physics.getLetterState(message.body.id)) this.createCenteredLetter(message.body.id, message.body.symbol, message.body.angle);
      if (message.body.state === "SETTLED") this.synchronizeSettledLetter(message.body);
    }
    // Transform packets deliberately do not drive this board. They describe
    // the opponent's rendering cadence, which is what caused visible stutter.
    return true;
  }

  renderStates(now: number): readonly PhysicsLetterState[] {
    if (this.previousAt !== null) {
      const deltaMs = Math.min(FIXED_PHYSICS_STEP_MS * MAX_CATCH_UP_STEPS, now - this.previousAt);
      if (deltaMs > 0) this.advancePhysics(deltaMs);
    }
    this.previousAt = now;
    return this.physics.getLetterStates();
  }

  getStates(): readonly PhysicsLetterState[] {
    return this.physics.getLetterStates();
  }

  targetId(): string | null { return this.physics.getLetterStates()[0]?.id ?? null; }
  targetSymbol(): string | null { const id = this.targetId(); return id ? this.symbols.get(id) ?? null : null; }

  clear(): void {
    this.physics.clear();
    this.symbols.clear();
    this.authoritativeSettledIds.clear();
    this.previousAt = null;
    this.physicsAccumulatorMs = 0;
  }

  private createCenteredLetter(id: string, symbol: string, angle: number): void {
    this.physics.createLetter({
      id,
      symbol,
      x: this.width / 2,
      y: this.height * BATTLE_BURST_SPAWN_RATIO,
      angle,
      velocityY: 2.4,
    });
    this.symbols.set(id, symbol);
  }

  private remove(id: string): void {
    this.physics.removeLetter(id);
    this.symbols.delete(id);
    this.authoritativeSettledIds.delete(id);
  }

  private synchronizeSettledLetter(body: BattleBodyTransform): void {
    this.physics.synchronizeSettledLetter(body.id, {
      x: body.x * this.width,
      y: body.y * this.height,
      angle: body.angle,
    });
    this.authoritativeSettledIds.add(body.id);
  }

  private restoreSnapshotLetter(body: BattleBodyTransform): void {
    const settled = body.state === "SETTLED";
    this.physics.restoreLetter({
      id: body.id,
      symbol: body.symbol,
      x: body.x * this.width,
      y: body.y * this.height,
      angle: body.angle,
      velocityX: settled ? 0 : body.velocityX,
      velocityY: settled ? 0 : body.velocityY,
      angularVelocity: settled ? 0 : body.angularVelocity,
      settled,
    });
    this.symbols.set(body.id, body.symbol);
    if (settled) this.authoritativeSettledIds.add(body.id);
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
}
