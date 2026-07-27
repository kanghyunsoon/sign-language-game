import type {
  FingerspellingCategoryId,
  FingerspellingEntry,
} from "./fingerspelling";
import { fingerspellingCategories, fingerspellingItems } from "./fingerspelling";

/** 테스트에서 출제 대상이 되는 분류. 지문자 분류를 그대로 사용한다. */
export type TestCategoryId = FingerspellingCategoryId;

/** 한 문항. 지문자 항목에 분류 정보를 붙인 형태다. */
export type TestQuestion = FingerspellingEntry;

/** 문항 채점 결과. 시간 초과와 넘어가기는 모두 오답으로 처리한다. */
export type TestAnswerState = "correct" | "wrong";

/** 채점이 끝난 문항. */
export interface TestQuestionResult {
  readonly question: TestQuestion;
  readonly state: TestAnswerState;
}

/** 설정 화면에서 고른 테스트 조건. */
export interface TestSettings {
  readonly categories: readonly TestCategoryId[];
  readonly questionCount: number;
}

/** 문항 수 선택지. */
export const TEST_QUESTION_COUNT_OPTIONS: readonly number[] = [5, 10, 15];

/** 문항당 제한 시간(초). */
export const TEST_TIME_LIMIT_SECONDS = 10;

/** 설정 화면에서 사용할 분류 목록. 지문자 분류와 동일하다. */
export const testCategories = fingerspellingCategories;

/**
 * 지문자 인식 판정 포트.
 *
 * 현재 프론트엔드에는 지문자 분류기가 없어 구현체를 제공하지 않는다.
 * 추후 AI 인식을 붙일 때 이 인터페이스의 구현체를 TestProgressView에 주입하면,
 * 화면 로직을 바꾸지 않고 자동 채점을 활성화할 수 있다.
 */
export interface TestSignJudge {
  /** 문항 시작. 정답 동작을 인식하면 onCorrect를 호출한다. */
  start(question: TestQuestion, onCorrect: () => void): void;
  /** 문항 종료. 진행 중인 인식을 정리한다. */
  stop(): void;
}

/**
 * 선택한 분류에 속한 전체 지문자 목록.
 * 분류 순서는 testCategories를 따라 자음 → 모음 → 숫자로 고정한다.
 */
export function testQuestionPool(
  categories: readonly TestCategoryId[],
): TestQuestion[] {
  const selected = new Set(categories);

  return testCategories
    .filter((category) => selected.has(category.id))
    .flatMap((category) =>
      fingerspellingItems[category.id].map((item) => ({
        ...item,
        categoryId: category.id,
        categoryLabel: category.label,
      })),
    );
}

/**
 * 선택한 분류로 출제할 수 있는 최대 문항 수.
 * 같은 글자를 반복 출제하지 않으므로 보유 글자 수를 넘지 못한다.
 */
export function maxQuestionCount(
  categories: readonly TestCategoryId[],
): number {
  return testQuestionPool(categories).length;
}

/**
 * 요청한 문항 수를 실제 출제 가능한 범위로 보정한다.
 * 분류를 고르지 않았으면 0을 돌려준다.
 */
export function resolveQuestionCount(
  categories: readonly TestCategoryId[],
  requestedCount: number,
): number {
  return Math.max(0, Math.min(requestedCount, maxQuestionCount(categories)));
}

/**
 * Fisher-Yates 셔플. 원본을 바꾸지 않고 새 배열을 돌려준다.
 * random은 테스트에서 순서를 고정하기 위해 주입할 수 있다.
 */
export function shuffle<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

/**
 * 선택한 분류의 글자를 섞어 문항을 만든다.
 * 중복 출제를 하지 않으므로 보유 글자 수보다 많이 요청하면 가능한 만큼만 돌려준다.
 */
export function buildTestQuestions(
  settings: TestSettings,
  random: () => number = Math.random,
): TestQuestion[] {
  const count = resolveQuestionCount(
    settings.categories,
    settings.questionCount,
  );

  return shuffle(testQuestionPool(settings.categories), random).slice(0, count);
}

/** 오답 문항만 추린다. 결과 화면의 오답노트 안내에 사용한다. */
export function wrongResults(
  results: readonly TestQuestionResult[],
): TestQuestionResult[] {
  return results.filter((result) => result.state === "wrong");
}
