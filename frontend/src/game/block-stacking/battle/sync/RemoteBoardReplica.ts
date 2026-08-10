import type { PhysicsLetterState } from "../../physics/types";
import type { BoardSnapshotEvent, LetterRemovedSyncEvent, LetterSpawnedSyncEvent, LetterStateSyncEvent, SpawnLetterEvent, TransformBatchEvent } from "../transport/battleTransportTypes";
import type { BattleSyncConfig } from "./InterpolationConfig";
import { boardStateChecksum } from "./BoardStateChecksum";
import { RemoteTransformBuffer } from "./RemoteTransformBuffer";

export type RemoteSyncMessage = TransformBatchEvent | BoardSnapshotEvent | LetterSpawnedSyncEvent | LetterStateSyncEvent | LetterRemovedSyncEvent;

/** Common remote-board surface used by both network replay and local physics displays. */
export interface RemoteBoard {
  resize(width: number, height: number): void;
  apply(message: RemoteSyncMessage, receivedAt: number): boolean;
  spawn(event: SpawnLetterEvent, receivedAt: number): boolean;
  renderStates(now: number): readonly PhysicsLetterState[];
  targetId(): string | null;
  targetSymbol(): string | null;
  removeLetter(letterId: string): boolean;
  snapshotBodies?(now: number): readonly import("../transport/battleTransportTypes").BattleBodyTransform[];
  consumeIntegrityFailure?(): boolean;
  clear(): void;
}

export class RemoteBoardReplica implements RemoteBoard {
  private readonly buffer: RemoteTransformBuffer; private readonly states = new Map<string, string>(); private readonly symbols = new Map<string, string>(); private lastSequence = -1; private senderClockOffsetMs: number | null = null; private hasAuthoritativeSnapshot = false; private integrityFailure = false;
  constructor(config: BattleSyncConfig, private width = 720, private height = 960) { this.buffer = new RemoteTransformBuffer(config); }
  resize(width: number, height: number): void { this.width = width; this.height = height; }
  apply(message: RemoteSyncMessage, receivedAt: number): boolean {
    const sampledAt = this.toLocalTimeline(message, receivedAt);
    if (message.sequence <= this.lastSequence && message.type !== "BODY_TRANSFORM_BATCH") return false;
    if (message.type === "BOARD_SNAPSHOT") {
      if (message.boardChecksum && message.boardChecksum !== boardStateChecksum(message.bodies)) {
        this.integrityFailure = true;
        return false;
      }
      const wasAuthoritative = this.hasAuthoritativeSnapshot;
      this.lastSequence = message.sequence; this.hasAuthoritativeSnapshot = true; const ids = message.bodies.filter((body) => body.state !== "REMOVED").map((body) => body.id); this.buffer.restore(ids); this.states.clear(); this.symbols.clear();
      for (const body of message.bodies) if (body.state !== "REMOVED") {
        this.states.set(body.id, body.state);
        this.symbols.set(body.id, body.symbol);
        // The first full board snapshot establishes authority. Later snapshots
        // must join the live transform history instead of resetting it; a reset
        // every snapshot interval is visible as a dropped frame on the remote
        // player's falling blocks.
        if (wasAuthoritative) this.buffer.push(message.sequence, sampledAt, body);
        else this.buffer.replace(message.sequence, sampledAt, body);
      }
      return true;
    }
    if (message.type === "BODY_TRANSFORM_BATCH") {
      if (message.sequence <= this.lastSequence) return false; this.lastSequence = message.sequence;
      for (const body of message.bodies) {
        // A transform may arrive after the later snapshot that removed this
        // letter.  Never recreate an unknown body from a delayed packet.
        if (this.hasAuthoritativeSnapshot && !this.states.has(body.id)) continue;
        this.states.set(body.id, body.state);
        this.symbols.set(body.id, body.symbol);
        this.buffer.push(message.sequence, sampledAt, body);
      }
      return true;
    }
    this.lastSequence = message.sequence;
    if (message.type === "LETTER_REMOVED_SYNC") { this.states.delete(message.letterId); this.symbols.delete(message.letterId); this.buffer.remove(message.letterId); return true; }
    if (message.type === "LETTER_STATE_SYNC") { if (message.state === "REMOVED") { this.states.delete(message.letterId); this.symbols.delete(message.letterId); this.buffer.remove(message.letterId); } else this.states.set(message.letterId, message.state); return true; }
    this.states.set(message.body.id, message.body.state); this.symbols.set(message.body.id, message.body.symbol); return this.buffer.push(message.sequence, sampledAt, message.body);
  }
  spawn(event: SpawnLetterEvent, receivedAt: number): boolean {
    if (this.states.has(event.letterId)) return false;
    const body = {
      id: event.letterId,
      symbol: event.symbol,
      x: clamp(event.normalizedX),
      y: clamp(event.normalizedY ?? .13),
      angle: event.initialAngle,
      velocityX: 0,
      velocityY: 0,
      angularVelocity: 0,
      state: "FALLING" as const,
    };
    this.states.set(body.id, body.state);
    this.symbols.set(body.id, body.symbol);
    // Authority and board-publisher sequence counters are independent.  The
    // placeholder therefore uses -1 and is always superseded by board data.
    return this.buffer.push(-1, receivedAt, body);
  }
  renderStates(now: number): readonly PhysicsLetterState[] {
    return this.buffer.ids().flatMap((id) => { const value = this.buffer.sample(id, now); if (!value || this.states.get(id) === "REMOVED") return [];
      return [{ id, symbol: value.symbol, x: value.x * this.width, y: value.y * this.height, angle: value.angle, velocityX: value.velocityX, velocityY: value.velocityY, angularVelocity: value.angularVelocity, settled: value.state === "SETTLED" }];
    });
  }
  targetId(): string | null { return this.buffer.ids()[0] ?? null; }
  targetSymbol(): string | null { const id = this.targetId(); return id ? this.symbols.get(id) ?? null : null; }
  removeLetter(letterId: string): boolean {
    if (!this.states.has(letterId)) return false;
    this.states.delete(letterId); this.symbols.delete(letterId); this.buffer.remove(letterId);
    return true;
  }
  getStates(now = Date.now()): readonly PhysicsLetterState[] { return this.renderStates(now); }
  snapshotBodies(now: number): readonly import("../transport/battleTransportTypes").BattleBodyTransform[] {
    return this.buffer.ids().flatMap((id) => {
      const value = this.buffer.sample(id, now);
      return value && this.states.get(id) !== "REMOVED" ? [{ ...value, state: this.states.get(id) === "SETTLED" ? "SETTLED" as const : "FALLING" as const }] : [];
    });
  }
  consumeIntegrityFailure(): boolean {
    const failed = this.integrityFailure;
    this.integrityFailure = false;
    return failed;
  }
  clear(): void { this.buffer.clear(); this.states.clear(); this.symbols.clear(); this.lastSequence = -1; this.senderClockOffsetMs = null; this.hasAuthoritativeSnapshot = false; this.integrityFailure = false; }
  private toLocalTimeline(message: RemoteSyncMessage, receivedAt: number): number {
    if (!("sentAt" in message) || !Number.isFinite(message.sentAt)) return receivedAt;
    if (this.senderClockOffsetMs === null) this.senderClockOffsetMs = receivedAt - message.sentAt;
    return message.sentAt + this.senderClockOffsetMs;
  }
}
const clamp = (value: number) => Math.max(-0.25, Math.min(1.25, value));
