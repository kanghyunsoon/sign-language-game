import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { FingerspellingDetail } from "./FingerspellingDetail";
import type { WordSignDetailEntry } from "./WordSignDetail";
import { WordSignDetail } from "./WordSignDetail";
import type { TestQuestionResult } from "../data/testSession";
import { wrongResults } from "../data/testSession";
import { addReviewNote, removeReviewNotes } from "../data/reviewNotes";
import type { FingerspellingEntry } from "../data/fingerspelling";
import { findWordSignEntry } from "../data/wordSigns";
import { findSentenceSign } from "../data/sentenceSigns";

interface TestResultViewProps {
  readonly results: readonly TestQuestionResult[];
  readonly onRetry: () => void;
}

/** 오답노트를 바꾼 뒤 잠깐 보여주는 알림. */
interface WrongNoteToast {
  readonly message: string;
  readonly tone: "add" | "remove";
}

/** 알림이 화면에 머무는 시간. */
const TOAST_DURATION_MS = 2200;

const isFingerspellingQuestion = (
  question: TestQuestionResult["question"],
): question is TestQuestionResult["question"] & FingerspellingEntry =>
  question.categoryId !== "word" && question.categoryId !== "sentence";

/** 테스트가 끝난 뒤 문항별 정오답과 지문자 상세를 보여주는 결과 화면. */
export function TestResultView({ results, onRetry }: TestResultViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  // 틀린 글자를 오답노트에 담아 둔 상태로 시작하고, 상세에서 개별로 넣고 뺄 수 있다.
  const [wrongNoteSymbols, setWrongNoteSymbols] = useState(
    () =>
      new Set(
        wrongResults(results)
          .map((result) => result.question.symbol),
      ),
  );

  // 틀린 글자는 결과 화면에 들어오는 즉시 오답노트에 담긴다.
  useEffect(() => {
    wrongResults(results)
      .forEach((result) => addReviewNote(result.question.symbol));
  }, [results]);

  const wrongCount = wrongResults(results).length;
  const correctCount = results.length - wrongCount;
  // 결과가 비어 있을 수는 없지만, 방어적으로 첫 항목을 고른다.
  const selectedResult = results[selectedIndex] ?? results[0];

  const [toast, setToast] = useState<WrongNoteToast | null>(null);

  // 알림은 잠깐 떴다가 스스로 사라진다.
  useEffect(() => {
    if (!toast) {
      return;
    }

    const timerId = window.setTimeout(() => setToast(null), TOAST_DURATION_MS);

    return () => window.clearTimeout(timerId);
  }, [toast]);

  const handleWrongNoteToggle = (symbol: string) => {
    const isInNote = wrongNoteSymbols.has(symbol);

    setWrongNoteSymbols((previous) => {
      const next = new Set(previous);

      if (isInNote) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }

      return next;
    });

    if (isInNote) {
      removeReviewNotes([symbol]);
    } else {
      addReviewNote(symbol);
    }

    setToast(
      isInNote
        ? { message: "오답노트에서 삭제되었어요.", tone: "remove" }
        : { message: "오답노트에 추가되었어요.", tone: "add" },
    );
  };

  if (!selectedResult) {
    return null;
  }

  const isSelectedInWrongNote = wrongNoteSymbols.has(
    selectedResult.question.symbol,
  );

  /*
   * 단어 문항은 TestQuestion으로 새로 만든 객체라 수형 설명과 소분류가 없다.
   * 사전 데이터에서 같은 단어를 찾아 넘겨 사전·오답노트와 같은 카드를 쓴다.
   * 못 찾는 경우에도 문항이 가진 정보만으로 카드를 채운다.
   *
   * 이 화면은 카드가 좁아 설명 상자도 좁다. 기본 줄 나눔이 넘치는 단어는
   * narrowDescription에 더 잘게 나눠 둔 값을 쓴다.
   */
  const wordEntry =
    findWordSignEntry(selectedResult.question.symbol) ??
    findSentenceSign(selectedResult.question.symbol);
  const selectedWordEntry: WordSignDetailEntry = wordEntry
    ? {
        ...wordEntry,
        description:
          "narrowDescription" in wordEntry && wordEntry.narrowDescription
            ? wordEntry.narrowDescription
            : wordEntry.description,
      }
    : {
        name: selectedResult.question.symbol,
        video: selectedResult.question.video ?? "",
        description: [],
      };

  // 이동 순서는 왼쪽 문항 목록 순서를 그대로 따른다.
  const goPreviousResult =
    selectedIndex > 0 ? () => setSelectedIndex(selectedIndex - 1) : undefined;
  const goNextResult =
    selectedIndex < results.length - 1
      ? () => setSelectedIndex(selectedIndex + 1)
      : undefined;

  const wrongNoteToggleButton = (
    <button
      className={`test-wrong-note-toggle ${
        isSelectedInWrongNote ? "test-wrong-note-toggle-remove" : ""
      }`}
      type="button"
      aria-pressed={isSelectedInWrongNote}
      onClick={() => handleWrongNoteToggle(selectedResult.question.symbol)}
    >
      {isSelectedInWrongNote ? "오답노트 삭제하기" : "오답노트 추가하기"}
    </button>
  );

  return (
    <main className="test-main test-result">
      <div className="test-result-layout">
        <section className="test-result-list-panel">
          <span className="test-badge">TEST RESULT</span>

          {/* 상세에서 넣고 뺀 결과가 바로 반영되도록 현재 담긴 개수를 보여준다.
              담긴 글자가 없으면 개수 대신 다 맞췄다고 알려 준다. */}
          <div className="test-result-headline">
            <h1 className="test-result-title">
              {correctCount === results.length
                ? "모든 문제를 맞췄어요!"
                : `${correctCount}문제를 맞췄어요!`}
            </h1>

            <p className="test-result-summary">
              총 {results.length}문항 중 정답 {correctCount}개 · 오답{" "}
              {wrongCount}개
            </p>
          </div>

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

                    <span
                      className={`test-result-symbol ${
                        result.question.categoryId === "word" ||
                        result.question.categoryId === "sentence"
                          ? "test-result-symbol-word"
                          : ""
                      }`}
                    >
                      {result.question.symbol}
                    </span>

                    {result.question.categoryId !== "word" &&
                      result.question.categoryId !== "sentence" && (
                      <span className="test-result-name">
                        {result.question.name}
                      </span>
                    )}

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

            <Link className="test-result-note-button" to="/review-notes">
              오답노트
            </Link>

            <Link className="test-result-main-button" to="/main">
              메인페이지
            </Link>
          </div>
        </section>

        {isFingerspellingQuestion(selectedResult.question) ? (
          <FingerspellingDetail
            className="test-result-detail"
            entry={selectedResult.question}
            footer={wrongNoteToggleButton}
            onPrevious={goPreviousResult}
            onNext={goNextResult}
          />
        ) : (
          <WordSignDetail
            className="test-result-detail"
            entry={selectedWordEntry}
            footer={wrongNoteToggleButton}
            onPrevious={goPreviousResult}
            onNext={goNextResult}
          />
        )}
      </div>

      {toast ? (
        <div className="test-toast" data-tone={toast.tone} role="status">
          <span className="test-toast-face" aria-hidden="true">
            {toast.tone === "add" ? "( ˶ˆ ᵕ ˆ˶ )" : "( ˘ ᵕ ˘ )"}
          </span>

          <span className="test-toast-message">{toast.message}</span>

          <Sparkles className="test-toast-sparkle" aria-hidden="true" size={18} />
        </div>
      ) : null}

    </main>
  );
}
