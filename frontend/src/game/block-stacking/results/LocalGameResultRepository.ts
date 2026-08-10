import type { GameResultRepository, GameResultSubmission, PersistedSymbolStatistic, StoredGameResult } from "./types";

export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }

export class LocalGameResultRepository implements GameResultRepository {
  private readonly storage: StorageLike;
  private readonly storageKey: string;
  constructor(storage: StorageLike, storageKey = "sign-language-prototype.game-results.v1") { this.storage = storage; this.storageKey = storageKey; }
  async save(result: GameResultSubmission): Promise<StoredGameResult> { const saved: StoredGameResult = { ...result, id: createId() }; const values = this.read(); values.push(saved); this.write(values); return saved; }
  async listMine(): Promise<readonly StoredGameResult[]> { return [...this.read()].sort((left, right) => right.playedAt.localeCompare(left.playedAt)); }
  async getMyBest(): Promise<StoredGameResult | null> { return (await this.listMine()).reduce<StoredGameResult | null>((best, value) => best === null || value.score > best.score ? value : best, null); }
  async getMySignStatistics(): Promise<readonly PersistedSymbolStatistic[]> {
    const aggregate = new Map<string, { targetCount: number; confirmedCount: number; correctCount: number; incorrectCount: number; confidenceTotal: number }>();
    for (const result of await this.listMine()) for (const stat of result.symbolStatistics) { const value = aggregate.get(stat.symbol) ?? { targetCount: 0, confirmedCount: 0, correctCount: 0, incorrectCount: 0, confidenceTotal: 0 }; value.targetCount += stat.targetCount; value.confirmedCount += stat.confirmedCount; value.correctCount += stat.correctCount; value.incorrectCount += stat.incorrectCount; value.confidenceTotal += stat.averageConfidence * stat.confirmedCount; aggregate.set(stat.symbol, value); }
    return [...aggregate.entries()].map(([symbol, value]) => ({ symbol, targetCount: value.targetCount, confirmedCount: value.confirmedCount, correctCount: value.correctCount, incorrectCount: value.incorrectCount, averageConfidence: value.confirmedCount === 0 ? 0 : value.confidenceTotal / value.confirmedCount })).sort((left, right) => left.symbol.localeCompare(right.symbol));
  }
  private read(): StoredGameResult[] { const raw = this.storage.getItem(this.storageKey); if (raw === null) return []; try { const parsed: unknown = JSON.parse(raw); return Array.isArray(parsed) ? parsed.filter(isStoredGameResult) : []; } catch { return []; } }
  private write(values: readonly StoredGameResult[]): void { this.storage.setItem(this.storageKey, JSON.stringify(values)); }
}

function createId(): string { return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function isStoredGameResult(value: unknown): value is StoredGameResult { return typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string" && typeof (value as { score?: unknown }).score === "number" && Array.isArray((value as { symbolStatistics?: unknown }).symbolStatistics); }
