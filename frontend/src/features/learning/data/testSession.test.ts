import { describe, expect, it } from "vitest";

import {
  TEST_QUESTION_COUNT_OPTIONS,
  TEST_TIME_LIMIT_SECONDS,
  buildTestQuestions,
  maxQuestionCount,
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
      expect(question.description).toHaveLength(2);
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

describe("테스트 설정 상수", () => {
  it("문항 수 선택지와 제한 시간을 고정한다", () => {
    expect(TEST_QUESTION_COUNT_OPTIONS).toEqual([5, 10, 15]);
    expect(TEST_TIME_LIMIT_SECONDS).toBe(10);
  });
});
