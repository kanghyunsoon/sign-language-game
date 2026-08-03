export type WordSignId =
  | "airplane"
  | "bicycle"
  | "moon"
  | "motorcycle"
  | "rain"
  | "run"
  | "ship"
  | "star"
  | "subway"
  | "swim"
  | "train"
  | "walk"
  | "wind"
  | "bad"
  | "bus"
  | "car"
  | "good"
  | "helicopter"
  | "sun";

/** 단어를 의미로 묶은 소분류. 사전 목록에서 접고 펴는 단위가 된다. */
export type WordSignGroupId = "vehicle" | "nature" | "motion" | "state";

export const wordSignGroups: readonly {
  readonly id: WordSignGroupId;
  readonly label: string;
}[] = [
  { id: "vehicle", label: "탈것" },
  { id: "nature", label: "자연" },
  { id: "motion", label: "운동" },
  { id: "state", label: "감정" },
];

export interface WordSignItem {
  readonly id: WordSignId;
  readonly name: string;
  readonly groupId: WordSignGroupId;
  readonly video: string;
}

export interface WordSignEntry extends WordSignItem {
  readonly symbol: string;
  readonly categoryId: "word";
  readonly categoryLabel: "단어";
  readonly recognitionSymbol: WordSignId;
  readonly image: "";
  readonly video: string;
  readonly description: string[];
}

/*
 * 목록 순서는 이 배열이 정한다. 분류 순서(탈것 → 자연 → 운동 → 감정)대로
 * 나열하고, 분류 안에서는 생활에서 가까운 것부터 둔다.
 * 사전 상세의 이전/다음 이동도 learningEntries를 통해 이 순서를 따른다.
 */
const wordSignLabels: readonly Omit<WordSignItem, "video">[] = [
  { id: "bus", name: "버스", groupId: "vehicle" },
  { id: "car", name: "자동차", groupId: "vehicle" },
  { id: "bicycle", name: "자전거", groupId: "vehicle" },
  { id: "motorcycle", name: "오토바이", groupId: "vehicle" },
  { id: "subway", name: "지하철", groupId: "vehicle" },
  { id: "train", name: "기차", groupId: "vehicle" },
  { id: "ship", name: "배", groupId: "vehicle" },
  { id: "airplane", name: "비행기", groupId: "vehicle" },
  { id: "helicopter", name: "헬리콥터", groupId: "vehicle" },

  { id: "sun", name: "해", groupId: "nature" },
  { id: "moon", name: "달", groupId: "nature" },
  { id: "star", name: "별", groupId: "nature" },
  { id: "rain", name: "비", groupId: "nature" },
  { id: "wind", name: "바람", groupId: "nature" },

  { id: "walk", name: "걷다", groupId: "motion" },
  { id: "run", name: "달리다", groupId: "motion" },
  { id: "swim", name: "수영하다", groupId: "motion" },

  { id: "good", name: "좋다", groupId: "state" },
  { id: "bad", name: "나쁘다", groupId: "state" },
];

export const wordSigns: readonly WordSignItem[] = wordSignLabels.map((word) => ({
  ...word,
  video: `/videos/words/${word.id}.webm`,
}));

export const wordSignEntries: readonly WordSignEntry[] = wordSigns.map(
  (word) => ({
    ...word,
    symbol: word.name,
    categoryId: "word",
    categoryLabel: "단어",
    recognitionSymbol: word.id,
    image: "",
    video: word.video,
    description: [],
  }),
);

/** 소분류별로 묶은 목록. 사전 왼쪽 트리가 이 순서로 렌더링한다. */
export const wordSignEntriesByGroup: readonly {
  readonly id: WordSignGroupId;
  readonly label: string;
  readonly entries: readonly WordSignEntry[];
}[] = wordSignGroups.map((group) => ({
  ...group,
  entries: wordSignEntries.filter((entry) => entry.groupId === group.id),
}));

export function findWordSignEntry(value: string): WordSignEntry | undefined {
  return wordSignEntries.find(
    (entry) => entry.symbol === value || entry.id === value,
  );
}

export function searchWordSignEntries(query: string): WordSignEntry[] {
  const keyword = query.trim();
  if (!keyword) return [...wordSignEntries];

  return wordSignEntries.filter(
    (entry) =>
      entry.name.includes(keyword) ||
      entry.id.toLowerCase().includes(keyword.toLowerCase()),
  );
}
