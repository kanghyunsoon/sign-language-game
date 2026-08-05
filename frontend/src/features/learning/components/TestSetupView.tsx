import { useState } from "react";
import type {
  TestCategoryId,
  TestCountPresetId,
  TestSettings,
} from "../data/testSession";
import {
  TEST_COUNT_PRESETS,
  TEST_TIME_LIMIT_SECONDS,
  isTestCategoryAvailable,
  maxQuestionCount,
  requestedCountForPreset,
  resolveQuestionCount,
  testCategories,
} from "../data/testSession";
import otterImage from "../assets/otter.webp";

interface TestSetupViewProps {
  readonly onStart: (settings: TestSettings) => void;
}

/** 테스트 조건(분류·문항 수)을 고르는 설정 화면. */
export function TestSetupView({ onStart }: TestSetupViewProps) {
  const [selectedCategories, setSelectedCategories] = useState<
    TestCategoryId[]
  >([]);
  const [presetId, setPresetId] = useState<TestCountPresetId | null>(null);
  const [customCount, setCustomCount] = useState(5);

  const availableCount = maxQuestionCount(selectedCategories);
  const requestedCount = presetId
    ? requestedCountForPreset(presetId, selectedCategories, customCount)
    : 0;
  const resolvedCount = resolveQuestionCount(
    selectedCategories,
    requestedCount,
  );
  const isStartDisabled =
    selectedCategories.length === 0 || presetId === null || resolvedCount === 0;
  // 보유 글자보다 많이 고르면 가능한 개수로 줄여 출제한다.
  const isCountReduced = resolvedCount > 0 && resolvedCount < requestedCount;

  /**
   * 직접 입력값을 출제 가능한 최대치로 잘라 넣는다.
   * 넘겨 적어도 어차피 최대치로 출제되므로, 입력칸이 실제 출제 수를 그대로 보여준다.
   * 분류를 하나도 고르지 않았으면 최대치가 0이라 자를 기준이 없어 입력값을 그대로 둔다.
   */
  const handleCustomCountChange = (rawValue: string) => {
    const requested = Number(rawValue) || 0;

    setCustomCount(
      availableCount > 0 ? Math.min(requested, availableCount) : requested,
    );
  };

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

    onStart({ categories: selectedCategories, questionCount: requestedCount });
  };

  const countNotice = () => {
    if (selectedCategories.length === 0) {
      return "분류를 한 개 이상 선택해 주세요.";
    }

    if (presetId === null) {
      return "문항 수를 선택해 주세요.";
    }

    if (isStartDisabled) {
      return "문항 수를 1개 이상 입력해 주세요.";
    }

    if (isCountReduced) {
      return `선택한 분류에는 ${availableCount}자가 있어 ${resolvedCount}문항으로 출제됩니다.`;
    }

    return `${resolvedCount}문항이 무작위 순서로 출제됩니다.`;
  };

  return (
    <main className="test-main test-setup">
      <div className="test-setup-panel">
        <span className="test-badge">TEST MODE</span>

        <div className="test-setup-character-circle">
          <img
            className="test-setup-character"
            src={otterImage}
            alt="수달 캐릭터"
          />
        </div>

        <h1 className="test-setup-title">테스트 수달</h1>

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
              const isAvailable = isTestCategoryAvailable(category.id);
              const isSelected =
                isAvailable && selectedCategories.includes(category.id);

              return (
                <button
                  className={`test-category ${
                    isSelected ? "test-category-selected" : ""
                  }`}
                  type="button"
                  key={category.id}
                  disabled={!isAvailable}
                  aria-pressed={isSelected}
                  title={
                    isAvailable
                      ? undefined
                      : "AI 인식 모델이 아직 숫자를 지원하지 않습니다."
                  }
                  onClick={() => handleCategoryToggle(category.id)}
                >
                  <span className="test-category-symbol">
                    {category.symbol}
                  </span>

                  {/* 글자는 왼쪽에 크게, 분류명과 글자 수는 그 오른쪽에 위아래로 둔다. */}
                  <span className="test-category-text">
                    <span className="test-category-label">
                      {category.label}
                    </span>

                    <span className="test-category-count">
                      {isAvailable
                        ? `${maxQuestionCount([category.id])}${
                            category.id === "word" || category.id === "sentence"
                              ? "개"
                              : "자"
                          }`
                        : "준비중"}
                    </span>
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
            {TEST_COUNT_PRESETS.map((preset) => {
              const isSelected = preset.id === presetId;

              return (
                <button
                  className={`test-count ${
                    isSelected ? "test-count-selected" : ""
                  }`}
                  type="button"
                  key={preset.id}
                  aria-pressed={isSelected}
                  onClick={() =>
                    setPresetId((previous) =>
                      previous === preset.id ? null : preset.id,
                    )
                  }
                >
                  {preset.label}
                </button>
              );
            })}

            {/* 입력칸은 [직접 입력] 버튼 바로 오른쪽에 붙는다. 라벨 글자는 보이지
                않게 하고 aria-label로만 남겨 이름을 잃지 않게 한다. */}
            {presetId === "custom" && (
              <span className="test-count-custom">
                <input
                  className="test-count-custom-input"
                  id="test-custom-count"
                  type="number"
                  min={1}
                  max={Math.max(1, availableCount)}
                  value={customCount}
                  aria-label="문항 수 직접 입력"
                  onChange={(event) =>
                    handleCustomCountChange(event.target.value)
                  }
                />

                <span className="test-count-custom-unit">개</span>
              </span>
            )}
          </div>

          <p className="test-setup-notice" role="status">
            {countNotice()}
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
