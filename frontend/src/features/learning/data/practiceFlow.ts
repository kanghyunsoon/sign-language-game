/**
 * 연습 분류의 학습 순서. 연습 선택 페이지의 카드 순서이자, 완료 안내창의
 * [다음 단계 연습하기]가 따라가는 순서다. 두 곳이 어긋나지 않도록 여기에 둔다.
 */
export const practiceFlowOrder = [
  "consonant",
  "vowel",
  "number",
  "word",
] as const;

export type PracticeFlowCategoryId = (typeof practiceFlowOrder)[number];

/** 안내창 버튼에 쓰는 짧은 이름. 선택 페이지의 "자음 연습"에서 "연습"을 뗀 형태다. */
export const practiceFlowLabels: Record<PracticeFlowCategoryId, string> = {
  consonant: "자음",
  vowel: "모음",
  number: "숫자",
  word: "단어",
};

/** 다음 단계 분류. 마지막(단어)이면 없다는 뜻으로 null을 준다. */
export function getNextPracticeCategory(
  categoryId: string | undefined,
): PracticeFlowCategoryId | null {
  const index = practiceFlowOrder.findIndex((id) => id === categoryId);
  if (index < 0) return null;

  return practiceFlowOrder[index + 1] ?? null;
}
