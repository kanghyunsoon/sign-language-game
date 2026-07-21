import type { PhysicsConfig, SettlementSample } from "./types";

export interface SettlementUpdate {
  readonly newlySettledIds: readonly string[];
  readonly movedIds: readonly string[];
}

export class SettlementDetector {
  private readonly stableForMs = new Map<string, number>();
  private readonly settledIds = new Set<string>();

  constructor(private readonly config: PhysicsConfig) {}

  update(samples: readonly SettlementSample[], deltaMs: number): SettlementUpdate {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new RangeError("deltaMs must be a finite non-negative number");
    const newlySettledIds: string[] = [];
    const movedIds: string[] = [];
    for (const sample of samples) {
      const stable = sample.linearSpeed <= this.config.linearVelocityThreshold
        && sample.angularSpeed <= this.config.angularVelocityThreshold;
      if (!stable) {
        this.stableForMs.delete(sample.id);
        if (this.settledIds.delete(sample.id)) movedIds.push(sample.id);
        continue;
      }
      const stableFor = (this.stableForMs.get(sample.id) ?? 0) + deltaMs;
      this.stableForMs.set(sample.id, stableFor);
      if (stableFor >= this.config.settleDurationMs && !this.settledIds.has(sample.id)) {
        this.settledIds.add(sample.id);
        newlySettledIds.push(sample.id);
      }
    }
    return { newlySettledIds, movedIds };
  }

  isSettled(id: string): boolean {
    return this.settledIds.has(id);
  }

  remove(id: string): void {
    this.stableForMs.delete(id);
    this.settledIds.delete(id);
  }

  clear(): void {
    this.stableForMs.clear();
    this.settledIds.clear();
  }
}
