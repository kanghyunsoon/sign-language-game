import type { InputLockConfig, InputLockSnapshot } from "./types";

export class InputLock {
  private lockedSymbol: string | null = null;
  private lockedAt: number | null = null;

  constructor(private readonly config: InputLockConfig) {}

  tryLock(symbol: string, at: number): boolean {
    if (!this.config.enabled) return true;
    if (this.lockedSymbol === null) {
      this.lockedSymbol = symbol;
      this.lockedAt = at;
      return true;
    }
    if (this.lockedSymbol === symbol) return false;
    if (!this.config.allowDifferentSymbolSwitch || this.lockedAt === null || at - this.lockedAt < this.config.cooldownMs) return false;
    this.lockedSymbol = symbol;
    this.lockedAt = at;
    return true;
  }

  release(): string | null {
    const released = this.lockedSymbol;
    this.lockedSymbol = null;
    this.lockedAt = null;
    return released;
  }

  snapshot(): InputLockSnapshot {
    return { lockedSymbol: this.lockedSymbol, lockedAt: this.lockedAt, enabled: this.config.enabled };
  }
}
