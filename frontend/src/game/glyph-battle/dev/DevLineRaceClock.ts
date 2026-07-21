import type { LineRaceClock } from "../core";

export class DevLineRaceClock implements LineRaceClock {
  private offsetMs = 0;
  private timeScale = 1;
  private sourceAnchor: number;
  private virtualAnchor: number;

  constructor(private readonly source: () => number = () => performance.now()) {
    this.sourceAnchor = source();
    this.virtualAnchor = this.sourceAnchor;
  }

  now(): number {
    return this.virtualAnchor + (this.source() - this.sourceAnchor) * this.timeScale + this.offsetMs;
  }

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError("Clock advance must be a finite non-negative number.");
    }
    this.offsetMs += milliseconds;
  }

  reset(): void {
    this.offsetMs = 0;
    this.timeScale = 1;
    this.sourceAnchor = this.source();
    this.virtualAnchor = this.sourceAnchor;
  }

  setTimeScale(scale: number): void {
    if (![.5, 1, 2].includes(scale)) throw new RangeError("Time scale must be 0.5, 1, or 2.");
    const current = this.now();
    this.offsetMs = 0;
    this.sourceAnchor = this.source();
    this.virtualAnchor = current;
    this.timeScale = scale;
  }

  getTimeScale(): number { return this.timeScale; }
}
