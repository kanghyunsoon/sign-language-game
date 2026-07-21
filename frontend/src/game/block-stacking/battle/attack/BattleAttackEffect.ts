import type { AttackCreatedEvent } from "../transport/battleTransportTypes";
export interface BattleAttackEffect { apply(event: AttackCreatedEvent): void; dispose(): void; }

