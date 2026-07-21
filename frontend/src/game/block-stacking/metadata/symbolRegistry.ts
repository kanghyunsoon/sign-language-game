export type SymbolCategory = "CONSONANT" | "VOWEL" | "DIGIT";
export type SymbolFeedbackMode = "STATIC_TEMPLATE" | "CLASSIFICATION_ONLY";
export type SymbolDifficulty = 1 | 2 | 3;

export interface GameSymbolMetadata {
  readonly symbol: string;
  readonly category: SymbolCategory;
  readonly displayName: string;
  readonly difficulty: SymbolDifficulty;
  readonly colliderKey: string;
  readonly feedbackMode: SymbolFeedbackMode;
  /** Baseline model availability only. Runtime CAPABILITIES is authoritative. */
  readonly modelSupported: boolean;
  readonly templateAvailable: boolean;
  readonly guideAsset: string | null;
  readonly description: string;
}

const consonant = (
  symbol: string,
  displayName: string,
  difficulty: SymbolDifficulty,
): GameSymbolMetadata => ({
  symbol, category: "CONSONANT", displayName, difficulty, colliderKey: "rect-basic",
  feedbackMode: "STATIC_TEMPLATE", modelSupported: true, templateAvailable: false,
  guideAsset: null, description: `Korean consonant ${symbol}.`,
});

const vowel = (
  symbol: string,
  displayName: string,
  difficulty: SymbolDifficulty,
  feedbackMode: SymbolFeedbackMode = "STATIC_TEMPLATE",
): GameSymbolMetadata => ({
  symbol, category: "VOWEL", displayName, difficulty, colliderKey: "rect-basic",
  feedbackMode, modelSupported: true, templateAvailable: false,
  guideAsset: null, description: `Korean vowel ${symbol}.`,
});

const digit = (symbol: string): GameSymbolMetadata => ({
  symbol, category: "DIGIT", displayName: `Digit ${symbol}`, difficulty: 1, colliderKey: "rect-basic",
  feedbackMode: "CLASSIFICATION_ONLY", modelSupported: false, templateAvailable: false,
  guideAsset: null, description: `Game digit ${symbol}; no AI support is assumed.`,
});

export const GAME_SYMBOL_REGISTRY: readonly GameSymbolMetadata[] = [
  consonant("ㄱ", "Giyeok", 1), consonant("ㄴ", "Nieun", 1), consonant("ㄷ", "Digeut", 1),
  consonant("ㄹ", "Rieul", 2), consonant("ㅁ", "Mieum", 1), consonant("ㅂ", "Bieup", 2),
  consonant("ㅅ", "Siot", 2), consonant("ㅇ", "Ieung", 2), consonant("ㅈ", "Jieut", 2),
  consonant("ㅊ", "Chieut", 2), consonant("ㅋ", "Kieuk", 2), consonant("ㅌ", "Tieut", 2),
  consonant("ㅍ", "Pieup", 2), consonant("ㅎ", "Hieuh", 3),
  vowel("ㅏ", "A", 1), vowel("ㅑ", "Ya", 2, "CLASSIFICATION_ONLY"), vowel("ㅓ", "Eo", 1),
  vowel("ㅕ", "Yeo", 2, "CLASSIFICATION_ONLY"), vowel("ㅗ", "O", 1), vowel("ㅛ", "Yo", 2, "CLASSIFICATION_ONLY"),
  vowel("ㅜ", "U", 1), vowel("ㅠ", "Yu", 2, "CLASSIFICATION_ONLY"), vowel("ㅡ", "Eu", 2),
  vowel("ㅣ", "I", 1), vowel("ㅐ", "Ae", 2), vowel("ㅒ", "Yae", 3), vowel("ㅔ", "E", 2),
  vowel("ㅖ", "Ye", 3), vowel("ㅢ", "Ui", 3), vowel("ㅚ", "Oe", 3), vowel("ㅟ", "Wi", 3),
  digit("0"), digit("1"), digit("2"), digit("3"), digit("4"), digit("5"), digit("6"),
  digit("7"), digit("8"), digit("9"),
] as const;

export const GAME_SYMBOLS = GAME_SYMBOL_REGISTRY.map((metadata) => metadata.symbol);

export function symbolsForCategory(category: SymbolCategory): readonly GameSymbolMetadata[] {
  return GAME_SYMBOL_REGISTRY.filter((metadata) => metadata.category === category);
}

export function metadataForSymbol(symbol: string): GameSymbolMetadata | undefined {
  return GAME_SYMBOL_REGISTRY.find((metadata) => metadata.symbol === symbol);
}

export function isCurrentModelSupported(symbol: string, supportedSymbols: readonly string[]): boolean {
  return supportedSymbols.includes(symbol);
}

export function isCurrentlyPlayable(
  metadata: GameSymbolMetadata,
  mode: "AI" | "MOCK" | "KEYBOARD" | "PYTHON_AI",
  supportedSymbols: readonly string[],
): boolean {
  return mode === "AI" || mode === "PYTHON_AI"
    ? isCurrentModelSupported(metadata.symbol, supportedSymbols)
    : true;
}
