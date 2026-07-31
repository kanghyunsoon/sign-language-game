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

export interface WordSignItem {
  readonly id: WordSignId;
  readonly name: string;
}

export const wordSigns: readonly WordSignItem[] = [
  { id: "airplane", name: "비행기" },
  { id: "bicycle", name: "자전거" },
  { id: "moon", name: "달" },
  { id: "motorcycle", name: "오토바이" },
  { id: "rain", name: "비" },
  { id: "run", name: "달리다" },
  { id: "ship", name: "배" },
  { id: "star", name: "별" },
  { id: "subway", name: "지하철" },
  { id: "swim", name: "수영하다" },
  { id: "train", name: "기차" },
  { id: "walk", name: "걷다" },
  { id: "wind", name: "바람" },
  { id: "bad", name: "나쁘다" },
  { id: "bus", name: "버스" },
  { id: "car", name: "자동차" },
  { id: "good", name: "좋다" },
  { id: "helicopter", name: "헬리콥터" },
  { id: "sun", name: "해" },
];
