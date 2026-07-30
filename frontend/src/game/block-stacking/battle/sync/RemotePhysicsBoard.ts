import { MatterPhysicsWorld } from "../../physics/MatterPhysicsWorld";
import { DEFAULT_PHYSICS_CONFIG, type PhysicsLetterState } from "../../physics/types";
import { BATTLE_LETTER_SIZE, DEFAULT_BATTLE_RUNTIME_CONFIG } from "../core/BattleRuntimeConfig";
import type { SpawnLetterEvent } from "../transport/battleTransportTypes";
import type { RemoteBoard, RemoteSyncMessage } from "./RemoteBoardReplica";

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
    letterColliderPadding: 7,
    rotationInertiaScale: 1.15,
    restitution: 0,
  });
  private readonly symbols = new Map<string, string>();
  private width = DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth;
  private height = DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight;
  private previousAt: number | null = null;

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

  apply(message: RemoteSyncMessage, _receivedAt: number): boolean {
    if (message.type === "LETTER_REMOVED_SYNC" || (message.type === "LETTER_STATE_SYNC" && message.state === "REMOVED")) {
      this.remove(message.letterId);
      return true;
    }
    if (message.type === "BOARD_SNAPSHOT") {
      const activeIds = new Set(message.bodies.filter((body) => body.state !== "REMOVED").map((body) => body.id));
      for (const id of [...this.symbols.keys()]) if (!activeIds.has(id)) this.remove(id);
      for (const body of message.bodies) {
        if (body.state !== "REMOVED" && !this.physics.getLetterState(body.id)) this.createCenteredLetter(body.id, body.symbol, body.angle);
      }
      return true;
    }
    if (message.type === "LETTER_SPAWNED_SYNC" && !this.physics.getLetterState(message.body.id)) {
      this.createCenteredLetter(message.body.id, message.body.symbol, message.body.angle);
    }
    // Transform packets deliberately do not drive this board. They describe
    // the opponent's rendering cadence, which is what caused visible stutter.
    return true;
  }

  renderStates(now: number): readonly PhysicsLetterState[] {
    if (this.previousAt !== null) {
      const deltaMs = Math.min(32, now - this.previousAt);
      if (deltaMs > 0) this.physics.update(deltaMs);
    }
    this.previousAt = now;
    return this.physics.getLetterStates();
  }

  targetId(): string | null { return this.physics.getLetterStates()[0]?.id ?? null; }
  targetSymbol(): string | null { const id = this.targetId(); return id ? this.symbols.get(id) ?? null : null; }

  clear(): void {
    this.physics.clear();
    this.symbols.clear();
    this.previousAt = null;
  }

  private createCenteredLetter(id: string, symbol: string, angle: number): void {
    this.physics.createLetter({
      id,
      symbol,
      x: this.width / 2,
      y: Math.max(-70, -Math.min(this.width, this.height) * .12),
      angle,
    });
    this.symbols.set(id, symbol);
  }

  private remove(id: string): void {
    this.physics.removeLetter(id);
    this.symbols.delete(id);
  }
}
