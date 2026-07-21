import type { PhysicsLetterState } from "../../physics/types";
import type { BoardSnapshotEvent, LetterRemovedSyncEvent, LetterSpawnedSyncEvent, LetterStateSyncEvent, TransformBatchEvent } from "../transport/battleTransportTypes";
import type { BattleSyncConfig } from "./InterpolationConfig";
import { RemoteTransformBuffer } from "./RemoteTransformBuffer";

export type RemoteSyncMessage = TransformBatchEvent | BoardSnapshotEvent | LetterSpawnedSyncEvent | LetterStateSyncEvent | LetterRemovedSyncEvent;

export class RemoteBoardReplica {
  private readonly buffer: RemoteTransformBuffer; private readonly states = new Map<string, string>(); private lastSequence = -1;
  constructor(config: BattleSyncConfig, private width = 720, private height = 960) { this.buffer = new RemoteTransformBuffer(config); }
  resize(width: number, height: number): void { this.width = width; this.height = height; }
  apply(message: RemoteSyncMessage, receivedAt: number): boolean {
    if (message.sequence <= this.lastSequence && message.type !== "BODY_TRANSFORM_BATCH") return false;
    if (message.type === "BOARD_SNAPSHOT") {
      this.lastSequence = message.sequence; const ids = message.bodies.filter((body) => body.state !== "REMOVED").map((body) => body.id); this.buffer.restore(ids); this.states.clear();
      for (const body of message.bodies) if (body.state !== "REMOVED") { this.states.set(body.id, body.state); this.buffer.push(message.sequence, receivedAt, body); } return true;
    }
    if (message.type === "BODY_TRANSFORM_BATCH") {
      if (message.sequence <= this.lastSequence) return false; this.lastSequence = message.sequence;
      for (const body of message.bodies) { this.states.set(body.id, body.state); this.buffer.push(message.sequence, receivedAt, body); } return true;
    }
    this.lastSequence = message.sequence;
    if (message.type === "LETTER_REMOVED_SYNC") { this.states.delete(message.letterId); this.buffer.remove(message.letterId); return true; }
    if (message.type === "LETTER_STATE_SYNC") { if (message.state === "REMOVED") { this.states.delete(message.letterId); this.buffer.remove(message.letterId); } else this.states.set(message.letterId, message.state); return true; }
    this.states.set(message.body.id, message.body.state); return this.buffer.push(message.sequence, receivedAt, message.body);
  }
  renderStates(now: number): readonly PhysicsLetterState[] {
    return this.buffer.ids().flatMap((id) => { const value = this.buffer.sample(id, now); if (!value || this.states.get(id) === "REMOVED") return [];
      return [{ id, symbol: value.symbol, x: value.x * this.width, y: value.y * this.height, angle: value.angle, velocityX: value.velocityX, velocityY: value.velocityY, angularVelocity: value.angularVelocity, settled: value.state === "SETTLED" }];
    });
  }
  targetId(): string | null { return this.buffer.ids()[0] ?? null; }
  clear(): void { this.buffer.clear(); this.states.clear(); this.lastSequence = -1; }
}
