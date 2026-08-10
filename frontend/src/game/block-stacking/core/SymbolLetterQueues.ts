export interface SymbolLetterQueueSnapshot {
  readonly settledIds: readonly string[];
  readonly fallingIds: readonly string[];
}

interface SymbolLetterQueue {
  readonly settledIds: string[];
  readonly fallingIds: string[];
}

export class SymbolLetterQueues {
  private readonly queues = new Map<string, SymbolLetterQueue>();

  enqueueFalling(symbol: string, id: string): void {
    this.queueFor(symbol).fallingIds.push(id);
  }

  enqueueSettled(symbol: string, id: string): void {
    this.queueFor(symbol).settledIds.push(id);
  }

  get(symbol: string): SymbolLetterQueueSnapshot {
    const queue = this.queues.get(symbol);
    return queue
      ? { settledIds: [...queue.settledIds], fallingIds: [...queue.fallingIds] }
      : { settledIds: [], fallingIds: [] };
  }

  private queueFor(symbol: string): SymbolLetterQueue {
    const existing = this.queues.get(symbol);
    if (existing) return existing;
    const created: SymbolLetterQueue = { settledIds: [], fallingIds: [] };
    this.queues.set(symbol, created);
    return created;
  }
}
