import "./PracticeHomePage.css";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import otterImage from "../assets/otter.png";
import type { FingerspellingCategoryId } from "../data/fingerspelling";
import { SYMBOLS_PARAM, parseSymbolSelection } from "../data/symbolSelection";
import { PracticeSessionPage } from "./PracticeSessionPage";

type PracticeCategoryId = FingerspellingCategoryId;

interface PracticeCategory {
  id: PracticeCategoryId;
  symbol: string;
  title: string;
  description: string;
  count: number;
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
];

export function PracticeHomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] =
    useState<PracticeCategoryId | null>(null);
  const [activeCategory, setActiveCategory] =
    useState<PracticeCategoryId | null>(null);

  // 오답노트에서 넘어온 글자 묶음. 있으면 분류 선택을 건너뛰고 바로 연습한다.
  const symbolsParam = searchParams.get(SYMBOLS_PARAM);
  const selectedItems = useMemo(
    () => parseSymbolSelection(symbolsParam),
    [symbolsParam],
  );

  const selectedPracticeCategory = practiceCategories.find(
    (category) => category.id === selectedCategory,
  );

  const handleCategoryClick = (categoryId: PracticeCategoryId) => {
    setSelectedCategory(categoryId);
  };

  const handlePreviousClick = () => {
    setSelectedCategory(null);
  };

  const handlePracticeStart = () => {
    if (!selectedPracticeCategory) {
      return;
    }

    setActiveCategory(selectedPracticeCategory.id);
  };

  const handlePracticeGuideOpen = () => {
    alert("연습 방법을 확인합니다.");
  };

  const handlePracticeExit = () => {
    setActiveCategory(null);
    setSelectedCategory(null);
  };

  /** 오답노트 연습을 끝내면 파라미터를 지워 평소 연습 선택 화면으로 돌아간다. */
  const handleSelectionExit = () => {
    navigate("/practice", { replace: true });
  };

  if (selectedItems.length > 0) {
    return (
      <PracticeSessionPage
        items={selectedItems}
        onExit={handleSelectionExit}
      />
    );
  }

  if (activeCategory) {
    return (
      <PracticeSessionPage
        category={activeCategory}
        onExit={handlePracticeExit}
      />
    );
  }

  return (
    <div className="practice-page">
      <div className="practice-canvas">
      <header className="practice-home-header">
        <nav className="practice-home-nav" aria-label="주요 메뉴">
          <Link to="/main">메인페이지</Link>
          <Link className="active" to="/practice">연습</Link>
          <Link to="/test">테스트</Link>
          <Link to="/dictionary">사전</Link>
          <Link to="/review-notes">오답노트</Link>
          <Link to="/game">게임</Link>
        </nav>

        <Link className="practice-home-mypage-button" to="/profile">
          마이페이지
        </Link>
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

          <h1 className="practice-title">연습 모드</h1>

          <div className="practice-category-list">
            {practiceCategories
              .filter(
                (category) =>
                  selectedCategory === null ||
                  category.id === selectedCategory,
              )
              .map((category) => {
                const isSelected = selectedCategory === category.id;

                return (
                  <button
                    className={`practice-category ${
                      isSelected ? "practice-category-selected" : ""
                    }`}
                    type="button"
                    key={category.id}
                    onClick={() => handleCategoryClick(category.id)}
                  >
                    <span className="practice-category-symbol">
                      {category.symbol}
                    </span>

                    <span className="practice-category-content">
                      <strong>{category.title}</strong>
                      <span>{category.description}</span>
                    </span>

                    <span className="practice-category-count">
                      총 {category.count}문제
                    </span>
                  </button>
                );
              })}
          </div>

          {selectedPracticeCategory && (
            <div className="practice-action-area">
              <button
                className="practice-previous-button"
                type="button"
                onClick={handlePreviousClick}
              >
                이전
              </button>

              <button
                className="practice-start-button"
                type="button"
                onClick={handlePracticeStart}
              >
                ▶ 연습 시작하기
              </button>

              <button
                className="practice-guide-button"
                type="button"
                onClick={handlePracticeGuideOpen}
              >
                연습 방법 보기
              </button>
            </div>
          )}
        </section>
      </main>
      </div>
    </div>
  );
}
