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
import type { TestCategoryId, TestQuestionResult } from "./testSession";

/** 항상 0을 돌려주는 난수. Fisher-Yates에서 순서가 결정적으로 바뀐다. */
const zeroRandom = () => 0;

describe("testQuestionPool", () => {
  it("선택한 분류의 글자만 모은다", () => {
    expect(testQuestionPool(["number"])).toHaveLength(10);
    expect(testQuestionPool(["consonant"])).toHaveLength(14);
    expect(testQuestionPool(["vowel"])).toHaveLength(17);
    expect(testQuestionPool(["word"])).toHaveLength(19);
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

describe("buildTestQuestions 분류 균형", () => {
  /** 분류별 출제 수를 센다. */
  const countByCategory = (
    categories: readonly TestCategoryId[],
    questionCount: number,
    random: () => number,
  ) => {
    const counts = new Map<TestCategoryId, number>();
    for (const question of buildTestQuestions({ categories, questionCount }, random)) {
      counts.set(question.categoryId, (counts.get(question.categoryId) ?? 0) + 1);
    }
    return counts;
  };

  it("다섯 분류에서 10문항이면 분류당 2문항씩 나온다", () => {
    // 합쳐 섞으면 보유 글자 수(자음14·모음17·숫자10·단어19·문장3)에 비례해
    // 문장이 거의 안 나오던 문제의 회귀 방지. 난수와 무관한 성질이므로
    // 실제 Math.random으로 여러 번 검사한다.
    const all: readonly TestCategoryId[] = ["consonant", "vowel", "number", "word", "sentence"];
    for (let run = 0; run < 20; run += 1) {
      const counts = countByCategory(all, 10, Math.random);
      for (const category of all) {
        expect(counts.get(category)).toBe(2);
      }
    }
  });

  it("분류 간 문항 수 차이는 최대 1이다", () => {
    for (let run = 0; run < 20; run += 1) {
      const counts = countByCategory(["consonant", "vowel"], 5, Math.random);
      const values = [...counts.values()].sort((a, b) => a - b);
      expect(values).toEqual([2, 3]);
    }
  });

  it("보유 글자가 바닥난 분류는 남은 분류가 이어받는다", () => {
    // 문장은 3개뿐: 3개를 다 쓰고 나머지 7개는 자음이 채워 총 10문항 유지.
    for (let run = 0; run < 20; run += 1) {
      const counts = countByCategory(["consonant", "sentence"], 10, Math.random);
      expect(counts.get("sentence")).toBe(3);
      expect(counts.get("consonant")).toBe(7);
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
  it("자음·모음·숫자·단어를 모두 테스트할 수 있다", () => {
    expect(UNSUPPORTED_TEST_CATEGORIES).toEqual([]);
    expect(isTestCategoryAvailable("number")).toBe(true);
    expect(isTestCategoryAvailable("consonant")).toBe(true);
    expect(isTestCategoryAvailable("vowel")).toBe(true);
    expect(isTestCategoryAvailable("word")).toBe(true);
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

  it("오답노트에서 선택한 숫자도 테스트 문항으로 유지한다", () => {
    const questions = buildTestQuestionsFromSymbols(
      entriesFor(["ㄱ", "1", "ㅏ", "10"]),
      zeroRandom,
    );

    expect(questions.map((question) => question.symbol).sort()).toEqual(
      ["ㄱ", "1", "ㅏ", "10"].sort(),
    );
  });

  it("남는 글자가 없으면 빈 배열이다", () => {
    expect(buildTestQuestionsFromSymbols([], zeroRandom)).toEqual([]);
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
