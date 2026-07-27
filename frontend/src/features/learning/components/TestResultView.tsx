import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import otterCharacter from "../../../game/block-stacking/assets/game-menu-otter.png";
import { FingerspellingDetail } from "./FingerspellingDetail";
import type { TestQuestionResult } from "../data/testSession";
import { wrongResults } from "../data/testSession";

interface TestResultViewProps {
  readonly results: readonly TestQuestionResult[];
  readonly onRetry: () => void;
}

/** 테스트가 끝난 뒤 문항별 정오답과 지문자 상세를 보여주는 결과 화면. */
export function TestResultView({ results, onRetry }: TestResultViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isWrongNoteComingSoon, setIsWrongNoteComingSoon] = useState(false);

  const wrongCount = wrongResults(results).length;
  const correctCount = results.length - wrongCount;
  // 결과가 비어 있을 수는 없지만, 방어적으로 첫 항목을 고른다.
  const selectedResult = results[selectedIndex] ?? results[0];

  if (!selectedResult) {
    return null;
  }

  return (
    <main className="test-main test-result">
      <div className="test-result-layout">
        <section className="test-result-list-panel">
          <span className="test-badge">TEST RESULT</span>

          <h1 className="test-result-title">
            {wrongCount}개 문자를 오답노트에 추가했어요!
          </h1>

          <p className="test-result-summary">
            총 {results.length}문항 중 정답 {correctCount}개 · 오답 {wrongCount}
            개
          </p>

          <ul className="test-result-list">
            {results.map((result, index) => {
              const isSelected = index === selectedIndex;
              const isCorrect = result.state === "correct";

              return (
                <li key={`${result.question.symbol}-${index}`}>
                  <button
                    className={`test-result-item ${
                      isSelected ? "test-result-item-selected" : ""
                    }`}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedIndex(index)}
                  >
                    <span className="test-result-order">{index + 1}</span>

                    <span className="test-result-symbol">
                      {result.question.symbol}
                    </span>

                    <span className="test-result-name">
                      {result.question.name}
                    </span>

                    <span
                      className={`test-result-mark ${
                        isCorrect
                          ? "test-result-mark-correct"
                          : "test-result-mark-wrong"
                      }`}
                    >
                      {isCorrect ? "O" : "X"}
                      <span className="test-result-mark-text">
                        {isCorrect ? "정답" : "오답"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="test-result-actions">
            <button
              className="test-result-retry-button"
              type="button"
              onClick={onRetry}
            >
              다시 테스트
            </button>

            <button
              className="test-result-note-button"
              type="button"
              onClick={() => setIsWrongNoteComingSoon(true)}
            >
              오답노트
            </button>

            <Link className="test-result-main-button" to="/main">
              메인페이지
            </Link>
          </div>
        </section>

        <FingerspellingDetail
          className="test-result-detail"
          entry={selectedResult.question}
        />
      </div>

      {isWrongNoteComingSoon ? (
        <div className="test-coming-soon-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsWrongNoteComingSoon(false); }}>
          <section className="test-coming-soon-dialog" role="dialog" aria-modal="true" aria-labelledby="test-coming-soon-title">
            <button type="button" className="test-coming-soon-close" aria-label="팝업 닫기" onClick={() => setIsWrongNoteComingSoon(false)}><X aria-hidden="true" size={20} /></button>
            <Sparkles className="test-coming-soon-sparkle" aria-hidden="true" size={30} />
            <img src={otterCharacter} alt="" />
            <h2 id="test-coming-soon-title">수달이 개발중..</h2>
            <p>조금만 기다려 주세요!<br />오답노트 기능을 만들고 있어요.</p>
            <button type="button" className="test-coming-soon-confirm" onClick={() => setIsWrongNoteComingSoon(false)}>기다릴게!</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
