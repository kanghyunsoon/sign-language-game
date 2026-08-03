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
  /** 수형 설명. 지문자와 같은 형식으로 문장 단위 배열로 둔다. */
  readonly description: readonly string[];
  readonly video: string;
}

export interface WordSignEntry extends WordSignItem {
  readonly symbol: string;
  readonly categoryId: "word";
  readonly categoryLabel: "단어";
  /** 소분류 표시 이름. 상세 카드 배지에 "단어 · 탈것"처럼 함께 보여준다. */
  readonly groupLabel: string;
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
  {
    id: "bus",
    name: "버스",
    groupId: "vehicle",
    description: [
      "한 손을 손바닥이 아래로 향하게 가로로 펴서 길을 표현합니다.",
      "다른 손은 검지와 중지를 살짝 구부려 올린 뒤,",
      "앞뒤로 움직여 버스가 달리는 모습을 표현합니다.",
    ],
  },
  {
    id: "car",
    name: "자동차",
    groupId: "vehicle",
    description: [
      "한 손을 약간 구부려 손등이 위로 향하게 하고,",
      "다른 손은 그 아래에 놓고 앞뒤로 움직입니다.",
    ],
  },
  {
    id: "bicycle",
    name: "자전거",
    groupId: "vehicle",
    description: [
      "양손을 손등이 보이도록 주먹 쥐어 올리고,",
      "자전거 페달을 밟는 것처럼 번갈아가며 원을 그리며 돌려줍니다.",
    ],
  },
  {
    id: "motorcycle",
    name: "오토바이",
    groupId: "vehicle",
    description: [
      "손등이 위로 향하게 가볍게 주먹 쥐고,",
      "한 손을 앞뒤로 돌려 가속 손잡이를 당기는 모습을 표현합니다.",
    ],
  },
  {
    id: "subway",
    name: "지하철",
    groupId: "vehicle",
    description: [
      "한 손을 손바닥이 아래로 향하게 가로로 펴고,",
      "다른 손을 아래쪽으로 지나가게 움직여",
      "지하로 달리는 열차를 표현합니다.",
    ],
  },
  {
    id: "train",
    name: "기차",
    groupId: "vehicle",
    description: [
      "한 손을 손끝이 바깥쪽을 향하게 펴주세요.",
      "다른 손은 검지와 중지를 펴서 손끝을 편 손바닥에 댄 뒤,",
      "바깥쪽으로 두 바퀴 돌립니다.",
    ],
  },
  {
    id: "ship",
    name: "배",
    groupId: "vehicle",
    description: [
      "새끼손가락끼리 붙여 양손을 모으고,",
      "배가 물 위를 나아가듯 두 손을 앞으로 움직입니다.",
    ],
  },
  {
    id: "airplane",
    name: "비행기",
    groupId: "vehicle",
    description: [
      "엄지손가락과 새끼손가락을 펴고,",
      "비행기가 날아가듯 대각선 위로 움직입니다.",
    ],
  },
  {
    id: "helicopter",
    name: "헬리콥터",
    groupId: "vehicle",
    description: ["검지를 위로 세워 프로펠러처럼 빙글빙글 돌립니다."],
  },

  {
    id: "sun",
    name: "해",
    groupId: "nature",
    description: [
      "양손의 엄지와 검지를 펴고,",
      "두 손을 아래에서 위로 올리며",
      "해가 떠오르는 모습을 표현합니다.",
    ],
  },
  {
    id: "moon",
    name: "달",
    groupId: "nature",
    description: [
      "엄지손가락과 검지손가락을 붙였다가 펴며",
      "초승달 모양을 만듭니다.",
    ],
  },
  {
    id: "star",
    name: "별",
    groupId: "nature",
    description: [
      "한 손을 머리 위쪽에 올립니다.",
      "손가락을 오므렸다 폈다 반복하며",
      "별이 반짝이는 모습을 표현합니다.",
    ],
  },
  {
    id: "rain",
    name: "비",
    groupId: "nature",
    description: [
      "양손의 손가락이 아래를 향하게 펴주세요.",
      "빗방울이 떨어지는 것처럼",
      "두 손을 위에서 아래로 여러 번 내립니다.",
    ],
  },
  {
    id: "wind",
    name: "바람",
    groupId: "nature",
    description: [
      "두 손을 벌려 손등이 위로 향하게 하였다가",
      "안으로 두 번 돌려 올립니다.",
    ],
  },

  {
    id: "walk",
    name: "걷다",
    groupId: "motion",
    description: [
      "검지와 중지를 아래로 향하게 펴주세요.",
      "두 손가락을 다리처럼 번갈아 움직이며 앞으로 나아갑니다.",
    ],
  },
  {
    id: "run",
    name: "달리다",
    groupId: "motion",
    description: [
      "양손을 가볍게 쥐고 팔꿈치를 구부립니다.",
      "달릴 때처럼 두 팔을 앞뒤로 번갈아 움직입니다.",
    ],
  },
  {
    id: "swim",
    name: "수영하다",
    groupId: "motion",
    description: [
      "한쪽 팔을 손등이 위로 향하게 가로로 올려주세요.",
      "다른 손의 검지와 중지를 편 뒤, 팔꿈치 위에서",
      "두 손가락을 번갈아 움직이며 손끝 방향으로 이동합니다.",
    ],
  },

  {
    id: "good",
    name: "좋다",
    groupId: "state",
    description: [
      "한 손으로 주먹을 쥔 뒤,",
      "검지와 엄지의 옆면을 코에 가볍게 대고 움직입니다.",
    ],
  },
  {
    id: "bad",
    name: "나쁘다",
    groupId: "state",
    description: [
      "검지를 펴고 코 부근에서 튕기듯 움직이며",
      "좋지 않은 표정을 짓습니다.",
    ],
  },
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
    groupLabel:
      wordSignGroups.find((group) => group.id === word.groupId)?.label ?? "",
    image: "",
    video: word.video,
    description: [...word.description],
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
