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

export type LearningEntry = FingerspellingEntry | WordSignEntry;
export type LearningCategoryId = LearningEntry["categoryId"];

export const learningEntries: readonly LearningEntry[] = [
  ...fingerspellingEntries,
  ...wordSignEntries,
];

export function findLearningEntry(value: string): LearningEntry | undefined {
  return findFingerspellingEntry(value) ?? findWordSignEntry(value);
}

export function searchLearningEntries(query: string): LearningEntry[] {
  return [
    ...searchFingerspellingEntries(query),
    ...searchWordSignEntries(query),
  ];
}
