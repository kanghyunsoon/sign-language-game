import type { PeerConnectionSlot } from "./PeerConnectionSlot";

export class PeerConnectionRegistry {
  private readonly slots = new Map<string, PeerConnectionSlot>();
  get size(): number { return this.slots.size; }
  get(userId: string): PeerConnectionSlot | undefined { return this.slots.get(userId); }
  has(userId: string): boolean { return this.slots.has(userId); }
  set(slot: PeerConnectionSlot): void { this.slots.set(slot.remoteUserId, slot); }
  delete(userId: string): boolean { return this.slots.delete(userId); }
  values(): readonly PeerConnectionSlot[] { return [...this.slots.values()]; }
  clear(): void { this.slots.clear(); }
}
