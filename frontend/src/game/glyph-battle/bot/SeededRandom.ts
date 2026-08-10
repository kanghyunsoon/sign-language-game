export class SeededRandom {
  private state: number;
  constructor(readonly seed: number) {
    if (!Number.isInteger(seed)) throw new RangeError("Random seed must be an integer.");
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296;
  }
  between(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) throw new RangeError("Invalid random range.");
    return min + (max - min) * this.next();
  }
  chance(probability: number): boolean {
    if (probability < 0 || probability > 1) throw new RangeError("Probability must be between 0 and 1.");
    return this.next() < probability;
  }
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Cannot pick from an empty list.");
    return items[Math.min(items.length - 1, Math.floor(this.next() * items.length))] as T;
  }
}
