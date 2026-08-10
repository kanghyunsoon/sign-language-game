import type {
  FingerspellingCategoryId,
  FingerspellingEntry,
} from "./fingerspelling";
import { fingerspellingCategories, fingerspellingItems } from "./fingerspelling";
import { wordSigns } from "./wordSigns";
import { sentenceSigns } from "./sentenceSigns";

/** 테스트에서 출제 대상이 되는 분류. 지문자 분류를 그대로 사용한다. */
export type TestCategoryId = FingerspellingCategoryId | "word" | "sentence";

/** 한 문항. 지문자 항목에 분류 정보를 붙인 형태다. */
export interface TestQuestion
  extends Omit<FingerspellingEntry, "categoryId"> {
  readonly categoryId: TestCategoryId;
  readonly video?: string;
  /** 화면 표시값과 AI 응답값이 다른 단어 문항에서 사용하는 정답 ID. */
  readonly recognitionSymbol?: string;
}

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

/** 문항 수 선택 방식. */
export type TestCountPresetId = "5" | "10" | "all" | "custom";

export interface TestCountPreset {
  readonly id: TestCountPresetId;
  readonly label: string;
  /** 고정 문항 수. 전체·직접 입력은 선택 상태에 따라 정해지므로 null이다. */
  readonly count: number | null;
}

/** 문항 수 선택지. */
export const TEST_COUNT_PRESETS: readonly TestCountPreset[] = [
  { id: "5", label: "5개", count: 5 },
  { id: "10", label: "10개", count: 10 },
  { id: "all", label: "전체", count: null },
  { id: "custom", label: "직접 입력", count: null },
];

/** 문항당 제한 시간(초). */
export const TEST_TIME_LIMIT_SECONDS = 10;

/** 설정 화면에서 사용할 분류 목록. */
export const testCategories: readonly {
  readonly id: TestCategoryId;
  readonly label: string;
  readonly symbol: string;
}[] = [
  ...fingerspellingCategories,
  { id: "word", label: "단어", symbol: "가" },
  { id: "sentence", label: "문장", symbol: "문" },
];

/** AI 인식 모델이 아직 지원하지 않아 테스트를 막아 둔 분류. */
export const UNSUPPORTED_TEST_CATEGORIES: readonly TestCategoryId[] = [];

/** 지금 테스트할 수 있는 분류인지 확인한다. */
export function isTestCategoryAvailable(categoryId: TestCategoryId): boolean {
  return !UNSUPPORTED_TEST_CATEGORIES.includes(categoryId);
}

/**
 * 프리셋과 직접 입력값으로 실제 요청 문항 수를 계산한다.
 * 전체는 선택한 분류의 보유 글자 수를 그대로 쓴다.
 */
export function requestedCountForPreset(
  presetId: TestCountPresetId,
  categories: readonly TestCategoryId[],
  customCount: number,
): number {
  if (presetId === "all") {
    return maxQuestionCount(categories);
  }

  if (presetId === "custom") {
    return customCount;
  }

  return Number(presetId);
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
    .flatMap((category): TestQuestion[] => {
      if (category.id === "word") {
        return wordSigns.map((word) => ({
          symbol: word.name,
          name: word.name,
          image: "",
          video: word.video,
          description: [],
          categoryId: category.id,
          categoryLabel: category.label,
          recognitionSymbol: word.id,
        }));
      }

      if (category.id === "sentence") {
        return sentenceSigns.map((sentence) => ({
          symbol: sentence.name,
          name: sentence.name,
          image: "",
          video: sentence.video,
          description: [...sentence.description],
          categoryId: category.id,
          categoryLabel: category.label,
          recognitionSymbol: sentence.id,
        }));
      }

      return fingerspellingItems[category.id].map((item) => ({
        ...item,
        categoryId: category.id,
        categoryLabel: category.label,
      }));
    });
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
 * 선택한 분류에서 균등하게 문항을 뽑는다.
 *
 * 전체 풀을 합쳐 섞으면 출제 확률이 보유 글자 수에 비례해서, 자음(14)·모음(17)·
 * 단어(19)가 문항을 독식하고 문장(3)은 거의 나오지 않는다. 그래서 분류별로 섞은
 * 뒤 라운드로빈으로 하나씩 뽑는다 — 분류 간 문항 수 차이는 최대 1이고, 보유
 * 글자가 적은 분류가 먼저 바닥나면 남은 분류가 이어받으므로 총 문항 수는
 * 요청대로 유지된다. 마지막에 전체를 다시 섞어 출제 순서에 분류 패턴이 남지
 * 않게 한다. 중복 출제는 없다.
 */
export function buildTestQuestions(
  settings: TestSettings,
  random: () => number = Math.random,
): TestQuestion[] {
  const count = resolveQuestionCount(
    settings.categories,
    settings.questionCount,
  );

  const pools = new Map<TestCategoryId, TestQuestion[]>();
  for (const question of testQuestionPool(settings.categories)) {
    const pool = pools.get(question.categoryId);
    if (pool) pool.push(question);
    else pools.set(question.categoryId, [question]);
  }

  // 각 분류 안에서 글자를 섞고, 분류 순회 순서도 섞어 특정 분류가 항상
  // 남는 한 문항을 가져가는 편향을 없앤다.
  const buckets = shuffle(
    [...pools.values()].map((pool) => shuffle(pool, random)),
    random,
  );

  const picked: TestQuestion[] = [];
  while (picked.length < count) {
    let drewAny = false;
    for (const bucket of buckets) {
      if (picked.length >= count) break;
      const question = bucket.pop();
      if (question) {
        picked.push(question);
        drewAny = true;
      }
    }
    if (!drewAny) break;
  }

  return shuffle(picked, random);
}

/**
 * 지정한 글자들로만 문항을 만든다. 오답노트에서 고른 글자를 그대로 출제할 때 쓴다.
 *
 * 분류·문항 수를 고르는 buildTestQuestions와 달리 대상이 이미 정해져 있어,
 * 출제 가능한 분류만 남기고 순서만 섞는다. 남는 글자가 없으면 빈 배열이다.
 * (숫자는 AI 모델 미지원으로 오답노트에 담기지 않지만, URL을 직접 고친 경우를 막는다.)
 */
export function buildTestQuestionsFromSymbols(
  entries: readonly TestQuestion[],
  random: () => number = Math.random,
): TestQuestion[] {
  return shuffle(
    entries.filter((entry) => isTestCategoryAvailable(entry.categoryId)),
    random,
  );
}

/** 오답 문항만 추린다. 결과 화면의 오답노트 안내에 사용한다. */
export function wrongResults(
  results: readonly TestQuestionResult[],
): TestQuestionResult[] {
  return results.filter((result) => result.state === "wrong");
}
