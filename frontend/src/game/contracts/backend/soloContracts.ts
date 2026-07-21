export type ExternalUuid = string;
export type EpochMillis = number;
export type SoloPlayMode = "KEYBOARD" | "AI";

export interface StartSoloSessionRequest {
  readonly difficulty: string;
  readonly symbolRange: readonly string[];
  readonly playMode: SoloPlayMode;
}

export interface StartSoloSessionResponse {
  readonly soloSessionId: ExternalUuid;
  readonly userId: ExternalUuid;
  readonly difficulty: string;
  readonly symbolRange: readonly string[];
  readonly playMode: SoloPlayMode;
  readonly startedAt: EpochMillis;
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
  readonly endedAt: EpochMillis;
}

export interface SoloGameResult extends CompleteSoloSessionRequest {
  readonly soloSessionId: ExternalUuid;
  readonly userId: ExternalUuid;
  readonly playMode: SoloPlayMode;
  readonly difficulty: string;
  readonly startedAt: EpochMillis;
}

