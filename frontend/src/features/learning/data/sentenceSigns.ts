export type SentenceSignId = "nice-to-meet-you" | "thank-you";

export interface SentenceSignItem {
  readonly id: SentenceSignId;
  readonly name: string;
  readonly groupId: "sentence";
  readonly description: readonly string[];
  readonly video: string;
}

export interface SentenceSignEntry extends SentenceSignItem {
  readonly symbol: string;
  readonly categoryId: "sentence";
  readonly categoryLabel: "문장";
  readonly recognitionSymbol: SentenceSignId;
  readonly image: "";
  readonly description: string[];
}

/** 영상과 설명은 자료가 준비되면 각 항목에 추가한다. */
export const sentenceSigns: readonly SentenceSignItem[] = [
  {
    id: "nice-to-meet-you",
    name: "반갑습니다",
    groupId: "sentence",
    description: [],
    video: "",
  },
  {
    id: "thank-you",
    name: "감사합니다",
    groupId: "sentence",
    description: [],
    video: "",
  },
];

export const sentenceSignEntries: readonly SentenceSignEntry[] =
  sentenceSigns.map((sentence) => ({
    ...sentence,
    symbol: sentence.name,
    categoryId: "sentence",
    categoryLabel: "문장",
    recognitionSymbol: sentence.id,
    image: "",
    description: [...sentence.description],
  }));

export function findSentenceSign(value: string): SentenceSignItem | undefined {
  return sentenceSigns.find(
    (sentence) => sentence.name === value || sentence.id === value,
  );
}

export function findSentenceSignEntry(
  value: string,
): SentenceSignEntry | undefined {
  return sentenceSignEntries.find(
    (entry) => entry.symbol === value || entry.id === value,
  );
}

export function searchSentenceSignEntries(query: string): SentenceSignEntry[] {
  const keyword = query.trim();
  if (!keyword) return [...sentenceSignEntries];

  return sentenceSignEntries.filter(
    (entry) =>
      entry.name.includes(keyword) ||
      entry.id.toLowerCase().includes(keyword.toLowerCase()),
  );
}
