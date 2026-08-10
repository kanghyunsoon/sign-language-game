import readiness from "../../../../../game-contracts/recognition/readiness.json";

export interface RecognitionClassReadiness {
  readonly symbol: string;
  readonly threshold: number;
  readonly precision: number;
  readonly recall: number;
  readonly confirmationRate: number;
  readonly competitiveEligible: boolean;
  readonly reason?: string;
}

export const RECOGNITION_READINESS = readiness;
export const RECOGNITION_CLASS_READINESS = readiness.classes as readonly RecognitionClassReadiness[];
export const RECOGNITION_CONFIDENCE_BY_SYMBOL: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(RECOGNITION_CLASS_READINESS.map((item) => [item.symbol, item.threshold])),
);
export const COMPETITIVE_RECOGNITION_SYMBOLS: readonly string[] = Object.freeze(
  RECOGNITION_CLASS_READINESS.filter((item) => item.competitiveEligible).map((item) => item.symbol),
);

export function readinessForSymbol(symbol: string): RecognitionClassReadiness | undefined {
  return RECOGNITION_CLASS_READINESS.find((item) => item.symbol === symbol);
}

export function isCompetitiveRecognitionReady(symbol: string): boolean {
  return readinessForSymbol(symbol)?.competitiveEligible === true;
}
