export type SoloPlayMode = "KEYBOARD" | "AI";

export interface StartSoloSessionRequest {
  readonly difficulty: string;
  readonly symbolRange: readonly string[];
  readonly playMode: SoloPlayMode;
}

export interface StartSoloSessionResponse extends StartSoloSessionRequest {
  readonly soloSessionId: string;
  readonly userId: string;
  readonly startedAt: number;
}

export interface SoloSymbolStatistic {
  readonly symbol: string;
  readonly correctCount: number;
  readonly incorrectCount: number;
  readonly confirmedCount: number;
}

export interface CompleteSoloSessionRequest {
  readonly finalScore: number;
  readonly maxCombo: number;
  readonly removedSymbolCount: number;
  readonly playDurationMs: number;
  readonly symbolStatistics: readonly SoloSymbolStatistic[];
  readonly endedAt: number;
}

export interface SoloGameResult extends CompleteSoloSessionRequest {
  readonly soloSessionId: string;
  readonly userId: string;
  readonly playMode: SoloPlayMode;
  readonly difficulty: string;
  readonly startedAt: number;
  readonly awardedExp: number;
}

export interface SoloGameApi {
  startSession(request: StartSoloSessionRequest): Promise<StartSoloSessionResponse>;
  completeSession(soloSessionId: string, request: CompleteSoloSessionRequest): Promise<SoloGameResult>;
  getResults(): Promise<readonly SoloGameResult[]>;
  getRank(): Promise<number | null>;
}
