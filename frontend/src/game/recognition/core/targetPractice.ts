import {
  GAME_CONSONANT_SYMBOLS,
  GAME_NUMBER_SYMBOLS,
  GAME_SYMBOLS,
  GAME_VOWEL_SYMBOLS,
} from "./symbols";

export type TargetCategory = "CONSONANT" | "VOWEL" | "NUMBER";
export type TargetInputMode = "AI" | "MOCK";
export type TargetComparison = "IDLE" | "SUCCESS" | "INCORRECT";

export function symbolsForCategory(category: TargetCategory): readonly string[] {
  switch (category) {
    case "CONSONANT": return GAME_CONSONANT_SYMBOLS;
    case "VOWEL": return GAME_VOWEL_SYMBOLS;
    case "NUMBER": return GAME_NUMBER_SYMBOLS;
  }
}

export function playableSymbols(
  mode: TargetInputMode,
  supportedSymbols: readonly string[],
): readonly string[] {
  if (mode === "MOCK") return GAME_SYMBOLS;
  const supported = new Set(supportedSymbols);
  return GAME_SYMBOLS.filter((symbol) => supported.has(symbol));
}

export function isTargetSelectable(
  symbol: string,
  mode: TargetInputMode,
  supportedSymbols: readonly string[],
): boolean {
  return playableSymbols(mode, supportedSymbols).includes(symbol);
}

export function adjacentTarget(
  current: string | null,
  symbols: readonly string[],
  direction: -1 | 1,
): string | null {
  if (symbols.length === 0) return null;
  const currentIndex = current === null ? -1 : symbols.indexOf(current);
  const baseIndex = currentIndex === -1 ? (direction === 1 ? -1 : 0) : currentIndex;
  return symbols[(baseIndex + direction + symbols.length) % symbols.length] ?? null;
}

export function randomTarget(
  symbols: readonly string[],
  random: () => number = Math.random,
): string | null {
  if (symbols.length === 0) return null;
  return symbols[Math.floor(random() * symbols.length)] ?? null;
}

export function compareConfirmedTarget(
  targetSymbol: string | null,
  confirmedSymbol: string,
): TargetComparison {
  if (targetSymbol === null) return "IDLE";
  return targetSymbol === confirmedSymbol ? "SUCCESS" : "INCORRECT";
}
