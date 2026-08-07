export type SentenceSignId = "nice-to-meet-you" | "thank-you" | "rain-is-good";

export interface SentenceSignItem {
  readonly id: SentenceSignId;
  readonly name: string;
  readonly groupId: "sentence";
  readonly description: readonly string[];
  readonly video: string;
  readonly recognitionSequence?: readonly string[];
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
    recognitionSequence: ["hello"],
    description: [
      "두 손을 약간 구부려 손끝을 양쪽 가슴에 대고 상하로 움직입니다.",
    ],
    video: "/videos/words/nicetomeetyou.webm",
  },
  {
    id: "thank-you",
    name: "감사합니다",
    groupId: "sentence",
    recognitionSequence: ["thankyou"],
    description: [
      "한 손을 가슴 앞에 두고, 다른 손으로 손등을 두드려 줍니다.",
    ],
    video: "/videos/words/thankyou.webm",
  },
  {
    id: "rain-is-good",
    name: "비가 좋다",
    groupId: "sentence",
    recognitionSequence: ["rain", "good"],
    description: [
      "빗방울이 떨어지듯 양손을 아래로 내린 후", "주먹을 쥔 손의 엄지와 검지 옆면을 코에 가볍게 댑니다.",
    ],
    video: "/videos/words/rain-is-good.webm",
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
