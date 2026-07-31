import "./ReviewNotesPage.css";
import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { FingerspellingDetail } from "../components/FingerspellingDetail";
import type { FingerspellingCategoryId } from "../data/fingerspelling";
import { fingerspellingCategories } from "../data/fingerspelling";
import { useReviewNotes, useRemoveReviewNotes } from "../data/reviewNotes";
import { SYMBOLS_PARAM, formatSymbolSelection } from "../data/symbolSelection";

/** 카테고리 필터 값. "all"은 전체 보기. */
type NoteFilterId = "all" | FingerspellingCategoryId;

const noteFilters: readonly { id: NoteFilterId; label: string }[] = [
  { id: "all", label: "전체" },
  ...fingerspellingCategories.map((category) => ({
    id: category.id,
    label: category.label,
  })),
];

/** 알림이 화면에 머무는 시간(ms). 테스트 결과 화면과 동일하게 맞춘다. */
const TOAST_DURATION_MS = 2000;

export function ReviewNotesPage() {
  const navigate = useNavigate();
  const notes = useReviewNotes();
  const removeNotes = useRemoveReviewNotes();

  const [pageScale, setPageScale] = useState(1);
  const [activeFilter, setActiveFilter] = useState<NoteFilterId>("all");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [checkedSymbols, setCheckedSymbols] = useState<readonly string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 사전 페이지와 동일한 1920x1200 캔버스 스케일링.
  useEffect(() => {
    const updatePageScale = () => {
      setPageScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1200));
    };

    updatePageScale();
    window.addEventListener("resize", updatePageScale);
    return () => window.removeEventListener("resize", updatePageScale);
  }, []);

  // 알림은 잠깐 떴다가 스스로 사라진다.
  useEffect(() => {
    if (!toastMessage) return;

    const timerId = window.setTimeout(() => setToastMessage(null), TOAST_DURATION_MS);
    return () => window.clearTimeout(timerId);
  }, [toastMessage]);

  const visibleNotes = useMemo(
    () =>
      activeFilter === "all"
        ? notes
        : notes.filter((entry) => entry.categoryId === activeFilter),
    [notes, activeFilter],
  );

  // 선택했던 글자가 삭제·필터로 사라지면 목록의 첫 항목으로 되돌린다.
  const selectedEntry =
    visibleNotes.find((entry) => entry.symbol === selectedSymbol) ??
    visibleNotes[0] ??
    null;

  // 필터에서 벗어난 카드의 체크는 액션 대상에서 제외한다.
  const checkedInView = checkedSymbols.filter((symbol) =>
    visibleNotes.some((entry) => entry.symbol === symbol),
  );

  const handleFilterChange = (filterId: NoteFilterId) => {
    setActiveFilter(filterId);
    setCheckedSymbols([]);
  };

  const handleMultiSelectToggle = () => {
    setIsMultiSelectMode((previous) => !previous);
    setCheckedSymbols([]);
  };

  /** 지금 보이는 카드를 모두 고른다. 이미 전부 골랐다면 모두 해제한다. */
  const handleSelectAll = () => {
    const isEveryChecked = checkedInView.length === visibleNotes.length;

    setCheckedSymbols(
      isEveryChecked ? [] : visibleNotes.map((entry) => entry.symbol),
    );
  };

  const handleCardClick = (symbol: string) => {
    if (!isMultiSelectMode) {
      setSelectedSymbol(symbol);
      return;
    }

    setCheckedSymbols((previous) =>
      previous.includes(symbol)
        ? previous.filter((checked) => checked !== symbol)
        : [...previous, symbol],
    );
  };

  /** 선택한 글자를 query parameter로 실어 연습·테스트 화면으로 보낸다. */
  const handleNavigateWithSelection = (path: "/practice" | "/test") => {
    const params = new URLSearchParams({
      [SYMBOLS_PARAM]: formatSymbolSelection(checkedInView),
    });
    navigate(`${path}?${params.toString()}`);
  };

  const handleDeleteChecked = () => {
    if (checkedInView.length === 0) return;

    removeNotes(checkedInView);
    setCheckedSymbols([]);
    setToastMessage("선택한 단어를 오답노트에서 삭제했어요.");
  };

  const handleDeleteSelected = () => {
    if (!selectedEntry) return;

    // 삭제 후 상세가 이어질 다음 항목을 미리 잡아 둔다.
    const currentIndex = visibleNotes.indexOf(selectedEntry);
    const nextEntry = visibleNotes[currentIndex + 1] ?? visibleNotes[currentIndex - 1];

    removeNotes([selectedEntry.symbol]);
    setSelectedSymbol(nextEntry?.symbol ?? null);
    setToastMessage(
      `'${selectedEntry.symbol}(${selectedEntry.name})'을 오답노트에서 삭제했어요.`,
    );
  };

  const hasNotes = notes.length > 0;

  return (
    <div className="review-notes-page">
      <div
        className="review-notes-canvas"
        style={{ transform: `translate(-50%, -50%) scale(${pageScale})` }}
      >
        <header className="review-notes-header">
          <nav className="review-notes-nav" aria-label="주요 메뉴">
            <Link to="/main">메인페이지</Link>
            <Link to="/practice">연습</Link>
            <Link to="/test">테스트</Link>
            <Link className="active" to="/review-notes">오답노트</Link>
            <Link to="/dictionary">사전</Link>
            <Link to="/game">게임</Link>
          </nav>

          <Link className="review-notes-mypage-button" to="/profile">
            마이페이지
          </Link>
        </header>

        <main className="review-notes-main">
          <div className="review-notes-heading">
            <span className="review-notes-badge">REVIEW NOTES</span>
            <h1>오답노트</h1>
            <p>복습이 필요한 틀린 지문자를 확인하고 연습·테스트해 보세요.</p>
          </div>

          <div className="review-notes-layout">
            <section className="review-notes-list-panel" aria-label="오답 지문자 목록">
              <div className="review-notes-controls">
                <div className="review-notes-filters" role="group" aria-label="분류 필터">
                  {noteFilters.map((filter) => {
                    const isActive = filter.id === activeFilter;

                    return (
                      <button
                        className={`review-notes-filter ${isActive ? "review-notes-filter-active" : ""}`}
                        key={filter.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => handleFilterChange(filter.id)}
                      >
                        {filter.label}
                      </button>
                    );
                  })}
                </div>

                <div className="review-notes-select-actions">
                  {isMultiSelectMode && (
                    <button
                      className="review-notes-select-all"
                      type="button"
                      disabled={visibleNotes.length === 0}
                      onClick={handleSelectAll}
                    >
                      전체 선택
                    </button>
                  )}

                  <button
                    className={`review-notes-select-toggle ${
                      isMultiSelectMode ? "review-notes-select-toggle-active" : ""
                    }`}
                    type="button"
                    disabled={!hasNotes}
                    aria-pressed={isMultiSelectMode}
                    onClick={handleMultiSelectToggle}
                  >
                    {isMultiSelectMode ? "취소" : "선택"}
                  </button>
                </div>
              </div>

              {visibleNotes.length === 0 ? (
                <p className="review-notes-empty" role="status">
                  {hasNotes
                    ? "이 분류에는 오답이 없어요."
                    : "오답노트가 비어있습니다."}
                </p>
              ) : (
                <ul className="review-notes-grid">
                  {visibleNotes.map((entry) => {
                    const isChecked = checkedSymbols.includes(entry.symbol);
                    const isHighlighted = isMultiSelectMode
                      ? isChecked
                      : entry.symbol === selectedEntry?.symbol;

                    return (
                      <li key={entry.symbol}>
                        <button
                          className={`review-notes-card ${isHighlighted ? "review-notes-card-active" : ""}`}
                          type="button"
                          aria-pressed={isHighlighted}
                          aria-label={`${entry.symbol} ${entry.name}`}
                          onClick={() => handleCardClick(entry.symbol)}
                        >
                          <span className="review-notes-card-tag">{entry.categoryLabel}</span>
                          <span className="review-notes-card-symbol">{entry.symbol}</span>
                          <span className="review-notes-card-name">{entry.name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {isMultiSelectMode && checkedInView.length > 0 && (
                <div className="review-notes-action-bar" role="group" aria-label="선택 항목 작업">
                  <span className="review-notes-action-count">
                    {checkedInView.length}개 선택됨
                  </span>

                  <button
                    className="review-notes-action review-notes-action-practice"
                    type="button"
                    onClick={() => handleNavigateWithSelection("/practice")}
                  >
                    연습하기
                  </button>

                  <button
                    className="review-notes-action review-notes-action-test"
                    type="button"
                    onClick={() => handleNavigateWithSelection("/test")}
                  >
                    테스트하기
                  </button>

                  <button
                    className="review-notes-action review-notes-action-delete"
                    type="button"
                    onClick={handleDeleteChecked}
                  >
                    삭제하기
                  </button>
                </div>
              )}
            </section>

            {selectedEntry ? (
              <FingerspellingDetail
                className="review-notes-detail"
                entry={selectedEntry}
                footer={
                  <button
                    className="review-notes-detail-delete"
                    type="button"
                    onClick={handleDeleteSelected}
                  >
                    오답노트 삭제하기
                  </button>
                }
              />
            ) : (
              <section className="review-notes-detail-empty" aria-live="polite">
                <span className="review-notes-detail-empty-face" aria-hidden="true">
                  ( ˘ ᵕ ˘ )
                </span>

                <p>오답노트가 비어있습니다.</p>

                <span>테스트에서 틀린 지문자를 담아 두면 여기에서 복습할 수 있어요.</span>
              </section>
            )}
          </div>
        </main>

      </div>

      {toastMessage && (
        <div className="review-notes-toast" role="status">
          <span className="review-notes-toast-face" aria-hidden="true">
            ( ˘ ᵕ ˘ )
          </span>

          <span className="review-notes-toast-message">{toastMessage}</span>

          <Sparkles className="review-notes-toast-sparkle" aria-hidden="true" size={18} />
        </div>
      )}
    </div>
  );
}
