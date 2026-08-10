import {
  GAME_SYMBOL_REGISTRY,
  GAME_SYMBOLS as REGISTERED_GAME_SYMBOLS,
  symbolsForCategory,
} from "../../block-stacking/metadata/symbolRegistry";

export const GAME_CONSONANT_SYMBOLS = symbolsForCategory("CONSONANT").map((metadata) => metadata.symbol);
export const GAME_VOWEL_SYMBOLS = symbolsForCategory("VOWEL").map((metadata) => metadata.symbol);
export const GAME_NUMBER_SYMBOLS = symbolsForCategory("DIGIT").map((metadata) => metadata.symbol);
export const GAME_SYMBOLS = REGISTERED_GAME_SYMBOLS;

/** Compatibility baseline only. CAPABILITIES controls live availability. */
export const MODEL_SUPPORTED_SYMBOLS = GAME_SYMBOL_REGISTRY
  .filter((metadata) => metadata.modelSupported)
  .map((metadata) => metadata.symbol);

export const MODEL_VERSION = "jamo-31-v1";
export const MODEL_SEQUENCE_LENGTH = 10;
