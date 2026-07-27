import { useState } from "react";
import type { TestCategoryId, TestSettings } from "../data/testSession";
import {
  TEST_QUESTION_COUNT_OPTIONS,
  TEST_TIME_LIMIT_SECONDS,
  maxQuestionCount,
  resolveQuestionCount,
  testCategories,
} from "../data/testSession";
import { fingerspellingItems } from "../data/fingerspelling";

interface TestSetupViewProps {
  readonly onStart: (settings: TestSettings) => void;
}

/** 테스트 조건(분류·문항 수)을 고르는 설정 화면. */
export function TestSetupView({ onStart }: TestSetupViewProps) {
  const [selectedCategories, setSelectedCategories] = useState<
    TestCategoryId[]
  >(["consonant"]);
  const [questionCount, setQuestionCount] = useState(
    TEST_QUESTION_COUNT_OPTIONS[0],
  );

  const availableCount = maxQuestionCount(selectedCategories);
  const resolvedCount = resolveQuestionCount(selectedCategories, questionCount);
  const isStartDisabled = resolvedCount === 0;
  // 보유 글자보다 많이 고르면 가능한 개수로 줄여 출제한다.
  const isCountReduced = resolvedCount > 0 && resolvedCount < questionCount;

  const handleCategoryToggle = (categoryId: TestCategoryId) => {
    setSelectedCategories((previous) =>
      previous.includes(categoryId)
        ? previous.filter((id) => id !== categoryId)
        : [...previous, categoryId],
    );
  };

  const handleStart = () => {
    if (isStartDisabled) {
      return;
    }

    onStart({ categories: selectedCategories, questionCount });
  };

  return (
    <main className="test-main test-setup">
      <div className="test-setup-panel">
        <span className="test-badge">TEST MODE</span>

        <h1 className="test-setup-title">테스트</h1>

        <p className="test-setup-description">
          연습한 지문자를 문제로 풀어보세요. 문항당 제한 시간은{" "}
          {TEST_TIME_LIMIT_SECONDS}초입니다.
        </p>

        <section className="test-setup-section">
          <h2 className="test-setup-section-title">
            분류 선택
            <span className="test-setup-section-hint">중복 선택 가능</span>
          </h2>

          <div className="test-category-list">
            {testCategories.map((category) => {
              const isSelected = selectedCategories.includes(category.id);

              return (
                <button
                  className={`test-category ${
                    isSelected ? "test-category-selected" : ""
                  }`}
                  type="button"
                  key={category.id}
                  aria-pressed={isSelected}
                  onClick={() => handleCategoryToggle(category.id)}
                >
                  <span className="test-category-symbol">
                    {category.symbol}
                  </span>

                  <span className="test-category-label">{category.label}</span>

                  <span className="test-category-count">
                    {fingerspellingItems[category.id].length}자
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="test-setup-section">
          <h2 className="test-setup-section-title">
            문항 수
            <span className="test-setup-section-hint">
              최대 {availableCount}문항
            </span>
          </h2>

          <div className="test-count-list">
            {TEST_QUESTION_COUNT_OPTIONS.map((count) => {
              const isSelected = count === questionCount;

              return (
                <button
                  className={`test-count ${
                    isSelected ? "test-count-selected" : ""
                  }`}
                  type="button"
                  key={count}
                  aria-pressed={isSelected}
                  onClick={() => setQuestionCount(count)}
                >
                  {count}개
                </button>
              );
            })}
          </div>

          <p className="test-setup-notice" role="status">
            {isStartDisabled
              ? "분류를 한 개 이상 선택해 주세요."
              : isCountReduced
                ? `선택한 분류에는 ${availableCount}자가 있어 ${resolvedCount}문항으로 출제됩니다.`
                : `${resolvedCount}문항이 무작위 순서로 출제됩니다.`}
          </p>
        </section>

        <button
          className="test-start-button"
          type="button"
          disabled={isStartDisabled}
          onClick={handleStart}
        >
          테스트 시작
        </button>
      </div>
    </main>
  );
}
