import type { FingerspellingEntry } from "./fingerspelling";
import {
  findFingerspellingEntry,
  fingerspellingEntries,
  searchFingerspellingEntries,
} from "./fingerspelling";
import type { WordSignEntry } from "./wordSigns";
import {
  findWordSignEntry,
  searchWordSignEntries,
  wordSignEntries,
} from "./wordSigns";
import type { SentenceSignEntry } from "./sentenceSigns";
import {
  findSentenceSignEntry,
  searchSentenceSignEntries,
  sentenceSignEntries,
} from "./sentenceSigns";

export type LearningEntry =
  | FingerspellingEntry
  | WordSignEntry
  | SentenceSignEntry;
export type LearningCategoryId = LearningEntry["categoryId"];

export const learningEntries: readonly LearningEntry[] = [
  ...fingerspellingEntries,
  ...wordSignEntries,
  ...sentenceSignEntries,
];

export function findLearningEntry(value: string): LearningEntry | undefined {
  return (
    findFingerspellingEntry(value) ??
    findWordSignEntry(value) ??
    findSentenceSignEntry(value)
  );
}

export function searchLearningEntries(query: string): LearningEntry[] {
  return [
    ...searchFingerspellingEntries(query),
    ...searchWordSignEntries(query),
    ...searchSentenceSignEntries(query),
  ];
}
