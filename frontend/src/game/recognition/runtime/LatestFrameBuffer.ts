export interface LatestFrameBuffer<T> {
  push(value: T): void;
  takeLatest(): T | undefined;
  peek(): T | undefined;
  clear(): void;
  hasPending(): boolean;
}

export class SingleLatestFrameBuffer<T> implements LatestFrameBuffer<T> {
  private value: T | undefined;
  private replacements = 0;

  push(value: T): void {
    if (this.value !== undefined) this.replacements += 1;
    this.value = value;
  }
  takeLatest(): T | undefined { const value = this.value; this.value = undefined; return value; }
  peek(): T | undefined { return this.value; }
  clear(): void { this.value = undefined; }
  hasPending(): boolean { return this.value !== undefined; }
  takeReplacementCount(): number { const value = this.replacements; this.replacements = 0; return value; }
}
