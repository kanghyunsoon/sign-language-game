const MIN_REMOVAL_HIGHLIGHT_DURATION_MS = 100;
const MAX_REMOVAL_HIGHLIGHT_DURATION_MS = 350;

export class RemovalEffect {
  private elapsedMs = 0;

  constructor(
    readonly id: string,
    readonly durationMs: number,
  ) {
    if (
      !Number.isFinite(durationMs) ||
      durationMs < MIN_REMOVAL_HIGHLIGHT_DURATION_MS ||
      durationMs > MAX_REMOVAL_HIGHLIGHT_DURATION_MS
    ) {
      throw new RangeError(
        `Removal highlight duration must be between ${MIN_REMOVAL_HIGHLIGHT_DURATION_MS} and ${MAX_REMOVAL_HIGHLIGHT_DURATION_MS}ms.`,
      );
    }
  }

  get progress(): number {
    return Math.min(this.elapsedMs / this.durationMs, 1);
  }

  get isFinished(): boolean {
    return this.elapsedMs >= this.durationMs;
  }

  advance(deltaMs: number): number {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) {
      throw new RangeError("Effect deltaMs must be a finite non-negative number.");
    }

    this.elapsedMs = Math.min(this.elapsedMs + deltaMs, this.durationMs);
    return this.progress;
  }
}
