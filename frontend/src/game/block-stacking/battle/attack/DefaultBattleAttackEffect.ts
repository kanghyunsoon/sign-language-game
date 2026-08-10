import type { AttackCreatedEvent } from "../transport/battleTransportTypes";
import type { BattleAttackEffect } from "./BattleAttackEffect";
export class DefaultBattleAttackEffect implements BattleAttackEffect {
  private readonly listeners = new Set<(event: AttackCreatedEvent) => void>();
  subscribe(listener: (event: AttackCreatedEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  apply(event: AttackCreatedEvent): void { for (const listener of this.listeners) listener(event); }
  dispose(): void { this.listeners.clear(); }
}

