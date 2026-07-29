import { describe, expect, it } from "vitest";

import {
  TEST_COUNT_PRESETS,
  TEST_TIME_LIMIT_SECONDS,
  UNSUPPORTED_TEST_CATEGORIES,
  buildTestQuestions,
  buildTestQuestionsFromSymbols,
  isTestCategoryAvailable,
  maxQuestionCount,
  requestedCountForPreset,
  resolveQuestionCount,
  shuffle,
  testQuestionPool,
  wrongResults,
} from "./testSession";
import type { TestQuestionResult } from "./testSession";

/** 항상 0을 돌려주는 난수. Fisher-Yates에서 순서가 결정적으로 바뀐다. */
const zeroRandom = () => 0;

describe("testQuestionPool", () => {
  it("선택한 분류의 글자만 모은다", () => {
    expect(testQuestionPool(["number"])).toHaveLength(10);
    expect(testQuestionPool(["consonant"])).toHaveLength(14);
    expect(testQuestionPool(["vowel"])).toHaveLength(17);
  });

  it("여러 분류를 자음 → 모음 → 숫자 순서로 합친다", () => {
    const pool = testQuestionPool(["number", "consonant"]);

    expect(pool).toHaveLength(24);
    expect(pool[0].categoryId).toBe("consonant");
    expect(pool.at(-1)?.categoryId).toBe("number");
  });

  it("분류를 고르지 않으면 빈 배열이다", () => {
    expect(testQuestionPool([])).toEqual([]);
  });
});

describe("resolveQuestionCount", () => {
  it("보유 글자 수보다 많이 요청하면 가능한 개수로 줄인다", () => {
    expect(maxQuestionCount(["number"])).toBe(10);
    expect(resolveQuestionCount(["number"], 15)).toBe(10);
  });

  it("보유 글자 수 이내면 요청한 수를 그대로 쓴다", () => {
    expect(resolveQuestionCount(["consonant", "vowel"], 15)).toBe(15);
  });

  it("분류가 없거나 음수를 요청하면 0이다", () => {
    expect(resolveQuestionCount([], 10)).toBe(0);
    expect(resolveQuestionCount(["consonant"], -3)).toBe(0);
  });
});

describe("shuffle", () => {
  it("원본을 바꾸지 않고 같은 원소를 돌려준다", () => {
    const original = [1, 2, 3, 4, 5];
    const shuffled = shuffle(original, zeroRandom);

    expect(original).toEqual([1, 2, 3, 4, 5]);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("주입한 난수로 순서가 결정된다", () => {
    expect(shuffle([1, 2, 3, 4, 5], zeroRandom)).toEqual(
      shuffle([1, 2, 3, 4, 5], zeroRandom),
    );
  });
});

describe("buildTestQuestions", () => {
  it("요청한 문항 수만큼 중복 없이 출제한다", () => {
    const questions = buildTestQuestions(
      { categories: ["consonant"], questionCount: 5 },
      zeroRandom,
    );

    expect(questions).toHaveLength(5);
    expect(new Set(questions.map((q) => q.symbol)).size).toBe(5);
  });

  it("보유 글자보다 많이 요청하면 가능한 만큼만 출제한다", () => {
    const questions = buildTestQuestions(
      { categories: ["number"], questionCount: 15 },
      zeroRandom,
    );

    expect(questions).toHaveLength(10);
    expect(new Set(questions.map((q) => q.symbol)).size).toBe(10);
  });

  it("분류를 섞어 출제할 수 있다", () => {
    const questions = buildTestQuestions(
      { categories: ["consonant", "number"], questionCount: 24 },
      zeroRandom,
    );

    const categories = new Set(questions.map((q) => q.categoryId));

    expect(questions).toHaveLength(24);
    expect(categories).toEqual(new Set(["consonant", "number"]));
  });

  it("분류를 고르지 않으면 문항이 없다", () => {
    expect(
      buildTestQuestions({ categories: [], questionCount: 10 }, zeroRandom),
    ).toEqual([]);
  });

  it("모든 문항이 상세 표시에 필요한 정보를 갖는다", () => {
    const questions = buildTestQuestions(
      { categories: ["consonant", "vowel", "number"], questionCount: 41 },
      zeroRandom,
    );

    expect(questions).toHaveLength(41);
    for (const question of questions) {
      expect(question.image).toBeTruthy();
      expect(question.name).toBeTruthy();
      expect(question.categoryLabel).toBeTruthy();
      // 문장 수는 설명 길이에 따라 다르므로 개수는 고정하지 않는다.
      expect(question.description.length).toBeGreaterThan(0);
    }
  });
});

describe("wrongResults", () => {
  it("오답 문항만 추린다", () => {
    const [correct, wrong] = buildTestQuestions(
      { categories: ["consonant"], questionCount: 2 },
      zeroRandom,
    );
    const results: TestQuestionResult[] = [
      { question: correct, state: "correct" },
      { question: wrong, state: "wrong" },
    ];

    expect(wrongResults(results)).toEqual([
      { question: wrong, state: "wrong" },
    ]);
  });
});

describe("requestedCountForPreset", () => {
  it("고정 프리셋은 숫자를 그대로 쓴다", () => {
    expect(requestedCountForPreset("5", ["consonant"], 7)).toBe(5);
    expect(requestedCountForPreset("10", ["consonant"], 7)).toBe(10);
  });

  it("전체는 선택한 분류의 보유 글자 수를 쓴다", () => {
    expect(requestedCountForPreset("all", ["consonant"], 7)).toBe(14);
    expect(requestedCountForPreset("all", ["consonant", "vowel"], 7)).toBe(31);
    expect(requestedCountForPreset("all", [], 7)).toBe(0);
  });

  it("직접 입력은 입력값을 쓴다", () => {
    expect(requestedCountForPreset("custom", ["consonant"], 7)).toBe(7);
    expect(requestedCountForPreset("custom", ["consonant"], 0)).toBe(0);
  });
});

describe("테스트 가능 분류", () => {
  it("AI가 지원하지 않는 숫자는 아직 테스트할 수 없다", () => {
    // 현재 모델(jamo-31-v1)은 자음·모음만 학습되어 있다.
    expect(UNSUPPORTED_TEST_CATEGORIES).toEqual(["number"]);
    expect(isTestCategoryAvailable("number")).toBe(false);
    expect(isTestCategoryAvailable("consonant")).toBe(true);
    expect(isTestCategoryAvailable("vowel")).toBe(true);
  });
});

describe("buildTestQuestionsFromSymbols", () => {
  /** 오답노트에서 넘어온 글자 묶음을 흉내낸다. */
  const entriesFor = (symbols: readonly string[]) =>
    symbols.map((symbol) => {
      const entry = testQuestionPool(["consonant", "vowel", "number"]).find(
        (question) => question.symbol === symbol,
      );

      if (!entry) throw new Error(`알 수 없는 글자: ${symbol}`);
      return entry;
    });

  it("넘겨받은 글자를 모두 출제한다", () => {
    const questions = buildTestQuestionsFromSymbols(
      entriesFor(["ㄱ", "ㄴ", "ㅏ"]),
      zeroRandom,
    );

    expect(questions).toHaveLength(3);
    expect(questions.map((question) => question.symbol).sort()).toEqual(
      ["ㄱ", "ㄴ", "ㅏ"].sort(),
    );
  });

  it("문항 수를 줄이지 않아 오답 전체를 복습할 수 있다", () => {
    const symbols = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ"];

    expect(
      buildTestQuestionsFromSymbols(entriesFor(symbols), zeroRandom),
    ).toHaveLength(symbols.length);
  });

  it("URL을 직접 고쳐 숫자가 들어와도 지원 분류만 남긴다", () => {
    const questions = buildTestQuestionsFromSymbols(
      entriesFor(["ㄱ", "1", "ㅏ", "10"]),
      zeroRandom,
    );

    expect(questions.map((question) => question.symbol).sort()).toEqual(
      ["ㄱ", "ㅏ"].sort(),
    );
  });

  it("남는 글자가 없으면 빈 배열이다", () => {
    expect(buildTestQuestionsFromSymbols([], zeroRandom)).toEqual([]);
    expect(
      buildTestQuestionsFromSymbols(entriesFor(["1", "2"]), zeroRandom),
    ).toEqual([]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const entries = entriesFor(["ㄱ", "ㄴ", "ㄷ"]);
    const before = entries.map((entry) => entry.symbol);

    buildTestQuestionsFromSymbols(entries, zeroRandom);

    expect(entries.map((entry) => entry.symbol)).toEqual(before);
  });
});

describe("테스트 설정 상수", () => {
  it("문항 수 선택지와 제한 시간을 고정한다", () => {
    expect(TEST_COUNT_PRESETS.map((preset) => preset.label)).toEqual([
      "5개",
      "10개",
      "전체",
      "직접 입력",
    ]);
    expect(TEST_TIME_LIMIT_SECONDS).toBe(10);
  });
});
