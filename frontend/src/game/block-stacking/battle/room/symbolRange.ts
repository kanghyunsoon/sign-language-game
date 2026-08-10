import { GAME_SYMBOL_REGISTRY } from "../../metadata/symbolRegistry";
import { isCompetitiveRecognitionReady } from "../../../recognition/readiness/recognitionReadiness";

export type SymbolRange = "CONSONANT" | "VOWEL" | "ALL";

const READY_SYMBOLS = GAME_SYMBOL_REGISTRY.filter((metadata) => isCompetitiveRecognitionReady(metadata.symbol));

export const SYMBOL_RANGE_OPTIONS: readonly {
  readonly value: SymbolRange;
  readonly label: string;
  readonly symbols: readonly string[];
}[] = [
  { value: "CONSONANT", label: "자음", symbols: READY_SYMBOLS.filter((symbol) => symbol.category === "CONSONANT").map((symbol) => symbol.symbol) },
  { value: "VOWEL", label: "모음", symbols: READY_SYMBOLS.filter((symbol) => symbol.category === "VOWEL").map((symbol) => symbol.symbol) },
  { value: "ALL", label: "기초 혼합", symbols: READY_SYMBOLS.filter((symbol) => symbol.category === "CONSONANT" || symbol.category === "VOWEL").map((symbol) => symbol.symbol) },
];

export function isSymbolRange(value: unknown): value is SymbolRange {
  return value === "CONSONANT" || value === "VOWEL" || value === "ALL";
}

export function symbolsForRange(range: SymbolRange): readonly string[] {
  return SYMBOL_RANGE_OPTIONS.find((option) => option.value === range)?.symbols ?? SYMBOL_RANGE_OPTIONS[2].symbols;
}

export function symbolRangeLabel(range: SymbolRange | readonly string[]): string {
  if (Array.isArray(range)) return range.length > 0 ? range.join(" · ") : "기초 혼합";
  return SYMBOL_RANGE_OPTIONS.find((option) => option.value === range)?.label ?? "기초 혼합";
}
