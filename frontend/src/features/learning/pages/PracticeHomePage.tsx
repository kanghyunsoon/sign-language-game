import "./PracticeHomePage.css";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { AppNav } from "../../../shared/nav/AppNav";
import otterImage from "../assets/otter.webp";
import type { FingerspellingCategoryId } from "../data/fingerspelling";
import {
  getPracticeCategorySymbols,
  practiceFlowOrder,
  type PracticeFlowCategoryId,
} from "../data/practiceFlow";
import { SYMBOLS_PARAM, parseSymbolSelection } from "../data/symbolSelection";
import { wordSigns } from "../data/wordSigns";
import { PracticeSessionPage } from "./PracticeSessionPage";
import { WordPracticeSessionPage } from "./WordPracticeSessionPage";

type PracticeCategoryId = FingerspellingCategoryId;
type PracticeHomeCategoryId = PracticeCategoryId | "word";

interface PracticeCategory {
  id: PracticeHomeCategoryId;
  symbol: string;
  title: string;
  description: string;
  count?: number;
  disabled?: boolean;
}

const practiceCategories: PracticeCategory[] = [
  {
    id: "consonant",
    symbol: "ㄱ",
    title: "자음 연습",
    description: "ㄱ부터 ㅎ까지 기본 자음 14개를 연습합니다.",
    count: 14,
  },
  {
    id: "vowel",
    symbol: "ㅏ",
    title: "모음 연습",
    description: "ㅏ부터 ㅢ까지 기본 모음 17개를 연습합니다.",
    count: 17,
  },
  {
    id: "number",
    symbol: "1",
    title: "숫자 연습",
    description: "1부터 10까지 기본 숫자 10개를 연습합니다.",
    count: 10,
  },
  {
    id: "word",
    symbol: "별",
    title: "단어 연습",
    description: `기본 단어 ${wordSigns.length}개를 연습합니다.`,
    count: wordSigns.length,
  },
];

export function PracticeHomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] =
    useState<PracticeHomeCategoryId | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<PracticeHomeCategoryId | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  /**
   * 이번에 이어서 연습한 분류들. [다음 단계]로 넘어올 때마다 쌓인다.
   * 완료 안내창의 [테스트하기]가 여기 담긴 범위를 한꺼번에 출제한다.
   * 예) 자음 → 모음 → 숫자로 이어왔으면 세 분류를 모두 테스트한다.
   */
  const [practicedCategories, setPracticedCategories] = useState<
    readonly PracticeFlowCategoryId[]
  >([]);

  // 오답노트에서 넘어온 글자 묶음. 있으면 분류 선택을 건너뛰고 바로 연습한다.
  const symbolsParam = searchParams.get(SYMBOLS_PARAM);
  const selectedItems = useMemo(
    () => parseSymbolSelection(symbolsParam),
    [symbolsParam],
  );
  const selectedWordItems = selectedItems.filter(
    (item) => item.categoryId === "word",
  );

  const selectedPracticeCategory = practiceCategories.find(
    (category) => category.id === selectedCategory,
  );

  const handleCategoryClick = (categoryId: PracticeHomeCategoryId) => {
    setSelectedCategory(categoryId);
  };

  const handlePracticeStart = () => {
    if (!selectedPracticeCategory) {
      return;
    }

    setActiveCategory(selectedPracticeCategory.id);
    /* 선택 페이지에서 새로 시작하면 이어온 기록을 버리고 이 분류만 담는다. */
    setPracticedCategories([selectedPracticeCategory.id]);
  };

  const handlePracticeGuideOpen = () => {
    setIsGuideOpen(true);
  };

  /** 완료 안내창에서 다음 분류로 넘어간다. 선택 페이지를 거치지 않는다. */
  const handleNextCategory = (categoryId: PracticeFlowCategoryId) => {
    setSelectedCategory(categoryId);
    setActiveCategory(categoryId);
    setPracticedCategories((previous) =>
      previous.includes(categoryId) ? previous : [...previous, categoryId],
    );
  };

  const handlePracticeExit = () => {
    setActiveCategory(null);
    setSelectedCategory(null);
    setPracticedCategories([]);
  };

  /** 오답노트에서 들어온 연습은 오답노트로 되돌린다(들어온 곳으로 나간다). */
  const handleSelectionExit = () => {
    navigate("/review-notes");
  };

  if (selectedItems.length > 0) {
    if (selectedWordItems.length === selectedItems.length) {
      return (
        <WordPracticeSessionPage
          words={selectedWordItems}
          onExit={handleSelectionExit}
        />
      );
    }

    return (
      <PracticeSessionPage
        items={selectedItems.filter((item) => item.categoryId !== "word")}
        onExit={handleSelectionExit}
      />
    );
  }

  if (activeCategory) {
    /* 이어서 연습한 분류를 학습 순서대로 모아 테스트 범위로 넘긴다. */
    const testSymbols = practiceFlowOrder
      .filter((categoryId) => practicedCategories.includes(categoryId))
      .flatMap(getPracticeCategorySymbols);

    if (activeCategory === "word") {
      return (
        <WordPracticeSessionPage
          onExit={handlePracticeExit}
          testSymbols={testSymbols}
        />
      );
    }

    return (
      /* 분류가 바뀌면 진행 상태를 처음부터 다시 잡도록 새로 마운트한다. */
      <PracticeSessionPage
        key={activeCategory}
        category={activeCategory}
        onExit={handlePracticeExit}
        onNextCategory={handleNextCategory}
        testSymbols={testSymbols}
      />
    );
  }

  return (
    <div className="practice-page">
      <div className="practice-canvas">
      <header className="practice-home-header">
        <AppNav prefix="practice-home" />
      </header>

      <main className="practice-main">
        <section className="practice-panel">
          <span className="practice-mode-badge">PRACTICE MODE</span>

          <div className="practice-character-circle">
            <img
              className="practice-character"
              src={otterImage}
              alt="수달 캐릭터"
            />
          </div>

          <h1 className="practice-title">연습 수달</h1>

          <div className="practice-category-list">
            {practiceCategories.map((category) => {
                const isSelected = selectedCategory === category.id;

                return (
                  <button
                    className={`practice-category ${
                      isSelected ? "practice-category-selected" : ""
                    }`}
                    type="button"
                    key={category.id}
                    disabled={category.disabled}
                    onClick={() => handleCategoryClick(category.id)}
                  >
                    <span className="practice-category-symbol">
                      {category.symbol}
                    </span>

                    <span className="practice-category-content">
                      <strong>{category.title}</strong>
                      <span>{category.description}</span>
                    </span>

                    {category.count !== undefined && (
                      <span className="practice-category-count">
                        {category.count}{category.id === "word" ? "개" : "자"}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          <div className="practice-action-area">
            <button
              className="practice-guide-button"
              type="button"
              onClick={handlePracticeGuideOpen}
            >
              연습 방법 보기
            </button>

            <button
              className="practice-start-button"
              type="button"
              disabled={!selectedPracticeCategory}
              onClick={handlePracticeStart}
            >
              ▶ 연습 시작하기
            </button>
          </div>
        </section>
      </main>

      {isGuideOpen && (
        <div
          className="practice-guide-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="practice-guide-title"
        >
          <section className="practice-guide-modal">
            <h2 id="practice-guide-title">연습 방법 보기</h2>
            <p className="practice-guide-intro">
              수달과 함께 천천히 따라 해볼까요?
            </p>

            <ol className="practice-guide-steps">
              <li>정답 동작을 확인해요.</li>
              <li>카메라에 손 전체가 보이도록 준비해요.</li>
              <li>카메라 영역을 누르고 동작을 따라 해요.</li>
              <li>연습이 끝나면 다음 문제로 이동해요.</li>
            </ol>

            <button
              className="practice-guide-close-button"
              type="button"
              onClick={() => setIsGuideOpen(false)}
            >
              연습하러 가기
            </button>
          </section>
        </div>
      )}
      </div>
    </div>
  );
}
