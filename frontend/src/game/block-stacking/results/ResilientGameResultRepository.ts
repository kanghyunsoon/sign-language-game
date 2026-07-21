import type { GameResultRepository, GameResultSubmission, PersistedSymbolStatistic, StoredGameResult } from "./types";

/** Keeps a local solo session usable when the optional HTTP API is offline. */
export class ResilientGameResultRepository implements GameResultRepository {
  constructor(private readonly remote: GameResultRepository, private readonly local: GameResultRepository) {}
  async save(result: GameResultSubmission): Promise<StoredGameResult> { try { return await this.remote.save(result); } catch { return this.local.save(result); } }
  async listMine(): Promise<readonly StoredGameResult[]> { try { return await this.remote.listMine(); } catch { return this.local.listMine(); } }
  async getMyBest(): Promise<StoredGameResult | null> { try { return await this.remote.getMyBest(); } catch { return this.local.getMyBest(); } }
  async getMySignStatistics(): Promise<readonly PersistedSymbolStatistic[]> { try { return await this.remote.getMySignStatistics(); } catch { return this.local.getMySignStatistics(); } }
}
