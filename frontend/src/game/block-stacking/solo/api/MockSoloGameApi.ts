import type {
  CompleteSoloSessionRequest,
  SoloGameApi,
  SoloGameResult,
  StartSoloSessionRequest,
  StartSoloSessionResponse,
} from "./SoloGameApi";

export interface MockSoloGameApiOptions {
  readonly userId?: string;
  readonly now?: () => number;
  readonly createId?: () => string;
}

export class MockSoloGameApi implements SoloGameApi {
  private readonly results: SoloGameResult[] = [];
  private readonly sessions = new Map<string, StartSoloSessionResponse>();
  private readonly userId: string;
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(options: MockSoloGameApiOptions = {}) {
    this.userId = options.userId ?? "00000000-0000-4000-8000-000000000001";
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID());
  }

  async startSession(request: StartSoloSessionRequest): Promise<StartSoloSessionResponse> {
    const session = { ...request, symbolRange: [...request.symbolRange], soloSessionId: this.createId(), userId: this.userId, startedAt: this.now() };
    this.sessions.set(session.soloSessionId, session);
    return session;
  }

  async completeSession(soloSessionId: string, request: CompleteSoloSessionRequest): Promise<SoloGameResult> {
    const session = this.sessions.get(soloSessionId);
    if (!session) throw new Error("Mock solo session was not found.");
    if (this.results.some((result) => result.soloSessionId === soloSessionId)) throw new Error("Mock solo session is already completed.");
    const result = { ...request, symbolStatistics: [...request.symbolStatistics], soloSessionId, userId: session.userId, playMode: session.playMode, difficulty: session.difficulty, startedAt: session.startedAt, awardedExp: 0 };
    this.results.push(result);
    return result;
  }

  async getResults(): Promise<readonly SoloGameResult[]> {
    return [...this.results];
  }

  async getRank(): Promise<number | null> {
    if (this.results.length === 0) return null;
    const latest = this.results[this.results.length - 1];
    const rank = [...this.results]
      .sort((left, right) => left.finalScore - right.finalScore || left.endedAt - right.endedAt)
      .findIndex((result) => result.soloSessionId === latest.soloSessionId);
    return rank < 0 ? null : rank + 1;
  }
}
