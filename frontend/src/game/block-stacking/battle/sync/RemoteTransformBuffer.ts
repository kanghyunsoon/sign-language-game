import type { BattleBodyTransform } from "../transport/battleTransportTypes";
import type { BattleSyncConfig } from "./InterpolationConfig";

interface TimedTransform { readonly sequence: number; readonly receivedAt: number; readonly value: BattleBodyTransform; }
const MAX_REMOVED_HISTORY = 128;

export class RemoteTransformBuffer {
  private readonly buffers = new Map<string, TimedTransform[]>(); private readonly removed = new Set<string>();
  constructor(private readonly config: BattleSyncConfig) {}
  push(sequence: number, receivedAt: number, transform: BattleBodyTransform): boolean {
    if (this.removed.has(transform.id)) return false;
    const buffer = this.buffers.get(transform.id) ?? [];
    if (buffer.some((sample) => sample.sequence >= sequence)) return false;
    buffer.push({ sequence, receivedAt, value: transform });
    if (buffer.length > this.config.maxBufferedSnapshots) buffer.splice(0, buffer.length - this.config.maxBufferedSnapshots);
    this.buffers.set(transform.id, buffer); return true;
  }
  /**
   * A full board snapshot is authoritative.  Retaining transform samples
   * received before it makes a delayed packet visually reappear below a newer
   * block, which is the source of the opponent-board overlaps.
   */
  replace(sequence: number, receivedAt: number, transform: BattleBodyTransform): void {
    if (this.removed.has(transform.id)) return;
    this.buffers.set(transform.id, [{ sequence, receivedAt, value: transform }]);
  }
  remove(letterId: string): void {
    this.removed.add(letterId);
    this.buffers.delete(letterId);
    // Delayed packets only need a short tombstone history. Keeping every
    // removed id for the full match made this cache grow without a bound.
    while (this.removed.size > MAX_REMOVED_HISTORY) {
      const oldest = this.removed.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.removed.delete(oldest);
    }
  }
  restore(letterIds: readonly string[]): void { const active = new Set(letterIds); for (const id of this.buffers.keys()) if (!active.has(id)) this.buffers.delete(id); for (const id of active) this.removed.delete(id); }
  sample(letterId: string, now: number): BattleBodyTransform | null {
    const buffer = this.buffers.get(letterId); if (!buffer?.length) return null;
    const target = now - this.config.interpolationDelayMs;
    let left = buffer[0]; let right = buffer[buffer.length - 1];
    for (let index = 1; index < buffer.length; index += 1) { if (buffer[index].receivedAt >= target) { left = buffer[index - 1]; right = buffer[index]; break; } }
    if (left === right || right.receivedAt <= left.receivedAt) return right.value;
    const t = clamp((target - left.receivedAt) / (right.receivedAt - left.receivedAt));
    const distance = Math.hypot(right.value.x - left.value.x, right.value.y - left.value.y);
    const angleDelta = shortestAngle(right.value.angle - left.value.angle);
    if (distance > this.config.snapDistanceThreshold || Math.abs(angleDelta) > this.config.snapAngleThreshold) return right.value;
    return { ...right.value, x: lerp(left.value.x, right.value.x, t), y: lerp(left.value.y, right.value.y, t), angle: left.value.angle + angleDelta * t, velocityX: lerp(left.value.velocityX, right.value.velocityX, t), velocityY: lerp(left.value.velocityY, right.value.velocityY, t), angularVelocity: lerp(left.value.angularVelocity, right.value.angularVelocity, t) };
  }
  ids(): readonly string[] { return [...this.buffers.keys()]; }
  size(letterId: string): number { return this.buffers.get(letterId)?.length ?? 0; }
  clear(): void { this.buffers.clear(); this.removed.clear(); }
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export const shortestAngle = (value: number): number => Math.atan2(Math.sin(value), Math.cos(value));
