import "./DictionaryPage.css";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { AppNav } from "../../../shared/nav/AppNav";
import { FingerspellingDetail } from "../components/FingerspellingDetail";
import { WordSignDetail } from "../components/WordSignDetail";
import {
  DEFAULT_FINGERSPELLING_SYMBOL,
  fingerspellingCategories,
  fingerspellingItems,
} from "../data/fingerspelling";
import type { LearningCategoryId } from "../data/learningEntries";
import {
  findLearningEntry,
  learningEntries,
  searchLearningEntries,
} from "../data/learningEntries";
import { wordSignEntries } from "../data/wordSigns";

/** 분류별 펼침 상태. 사전 진입 시 자음만 펼쳐 둔다. */
const initialOpenCategoryMap: Record<LearningCategoryId, boolean> = {
  consonant: true,
  vowel: false,
  number: false,
  word: false,
};

export function DictionaryPage() {
  const [dictionaryScale, setDictionaryScale] = useState(1);
  const [selectedSymbol, setSelectedSymbol] = useState(
    DEFAULT_FINGERSPELLING_SYMBOL,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isFingerspellingOpen, setIsFingerspellingOpen] = useState(true);
  const [isNumberOpen, setIsNumberOpen] = useState(false);
  const [isWordOpen, setIsWordOpen] = useState(false);
  const [openCategoryMap, setOpenCategoryMap] = useState(
    initialOpenCategoryMap,
  );

  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    const updateDictionaryScale = () => {
      setDictionaryScale(
        Math.min(window.innerWidth / 1920, window.innerHeight / 1200),
      );
    };

    updateDictionaryScale();
    window.addEventListener("resize", updateDictionaryScale);
    window.visualViewport?.addEventListener("resize", updateDictionaryScale);
    return () => {
      window.removeEventListener("resize", updateDictionaryScale);
      window.visualViewport?.removeEventListener("resize", updateDictionaryScale);
    };
  }, []);
  const searchResults = isSearching
    ? searchLearningEntries(searchQuery)
    : [];
  // 알 수 없는 글자가 남아도 항상 유효한 항목을 보여준다.
  const selectedEntry =
    findLearningEntry(selectedSymbol) ?? learningEntries[0];

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSearchClear = () => {
    setSearchQuery("");
  };

  const handleFingerspellingToggle = () => {
    setIsFingerspellingOpen((previous) => !previous);
  };

  const handleCategoryToggle = (categoryId: LearningCategoryId) => {
    setOpenCategoryMap((previous) => ({
      ...previous,
      [categoryId]: !previous[categoryId],
    }));
  };

  /** 항목을 선택하고, 분류 트리에서 해당 항목이 보이도록 펼친다. */
  const handleEntrySelect = (
    symbol: string,
    categoryId: LearningCategoryId,
  ) => {
    setSelectedSymbol(symbol);

    if (categoryId === "number") {
      setIsNumberOpen(true);
    } else if (categoryId === "word") {
      setIsWordOpen(true);
    } else {
      setIsFingerspellingOpen(true);
      setOpenCategoryMap((previous) => ({ ...previous, [categoryId]: true }));
    }
  };

  return (
    <div className="dictionary-page">
      <div
        className="dictionary-canvas"
        style={{
          transform: `translate(-50%, -50%) scale(${dictionaryScale})`,
        }}
      >
      <header className="dictionary-header">
        <AppNav prefix="dictionary" metric="fixed" />
      </header>

      <main className="dictionary-main">
        <div className="dictionary-heading">
          <span className="dictionary-badge">DICTIONARY</span>
          <h1>수어 사전</h1>
          <p>자음·모음·숫자와 단어 수어를 검색하고 동작을 확인해 보세요.</p>
        </div>

        <div className="dictionary-layout">
          <aside className="dictionary-sidebar" aria-label="지문자 목록">
            <div className="dictionary-search">
              <Search
                className="dictionary-search-icon"
                size={18}
                aria-hidden="true"
              />

              <input
                className="dictionary-search-input"
                type="search"
                value={searchQuery}
                onChange={handleSearchChange}
                aria-label="지문자 검색"
                placeholder="ㄱ, 기역, 1, 비행기처럼 입력해 보세요"
              />

              {isSearching && (
                <button
                  className="dictionary-search-clear"
                  type="button"
                  aria-label="검색어 지우기"
                  onClick={handleSearchClear}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            {isSearching ? (
              <div className="dictionary-results">
                <p className="dictionary-results-summary">
                  검색 결과 {searchResults.length}개
                </p>

                {searchResults.length === 0 ? (
                  <p className="dictionary-results-empty">
                    검색 결과가 없어요.
                  </p>
                ) : (
                  <ul className="dictionary-result-list">
                    {searchResults.map((entry) => {
                      const isSelected = entry.symbol === selectedEntry.symbol;

                      return (
                        <li key={entry.symbol}>
                          <button
                            className={`dictionary-result ${
                              isSelected ? "dictionary-result-selected" : ""
                            }`}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() =>
                              handleEntrySelect(entry.symbol, entry.categoryId)
                            }
                          >
                            <span className="dictionary-result-symbol">
                              {entry.symbol}
                            </span>

                            <span className="dictionary-result-name">
                              {entry.name}
                            </span>

                            <span className="dictionary-result-category">
                              {entry.categoryLabel}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <div className="dictionary-tree">
                <button
                  className="dictionary-tree-root"
                  type="button"
                  aria-expanded={isFingerspellingOpen}
                  aria-controls="dictionary-tree-branch"
                  onClick={handleFingerspellingToggle}
                >
                  <span>지문자</span>

                  <span className="dictionary-tree-count">
                    {fingerspellingItems.consonant.length +
                      fingerspellingItems.vowel.length}
                  </span>

                  <ChevronDown
                    className={`dictionary-tree-chevron ${
                      isFingerspellingOpen ? "is-open" : ""
                    }`}
                    size={18}
                    aria-hidden="true"
                  />
                </button>

                {isFingerspellingOpen && (
                  <div
                    className="dictionary-tree-branch"
                    id="dictionary-tree-branch"
                  >
                    {fingerspellingCategories
                      .filter((category) => category.id !== "number")
                      .map((category) => {
                      const items = fingerspellingItems[category.id];
                      const isOpen = openCategoryMap[category.id];

                      return (
                        <div className="dictionary-tree-group" key={category.id}>
                          <button
                            className="dictionary-tree-category"
                            type="button"
                            aria-expanded={isOpen}
                            aria-controls={`dictionary-chips-${category.id}`}
                            onClick={() => handleCategoryToggle(category.id)}
                          >
                            <span>{category.label}</span>

                            <span className="dictionary-tree-count">
                              {items.length}
                            </span>

                            <ChevronDown
                              className={`dictionary-tree-chevron ${
                                isOpen ? "is-open" : ""
                              }`}
                              size={16}
                              aria-hidden="true"
                            />
                          </button>

                          {isOpen && (
                            <ul
                              className="dictionary-chip-grid"
                              id={`dictionary-chips-${category.id}`}
                            >
                              {items.map((item) => {
                                const isSelected =
                                  item.symbol === selectedEntry.symbol;

                                return (
                                  <li key={item.symbol}>
                                    <button
                                      className={`dictionary-chip ${
                                        isSelected
                                          ? "dictionary-chip-selected"
                                          : ""
                                      }`}
                                      type="button"
                                      aria-pressed={isSelected}
                                      aria-label={`${item.symbol} ${item.name}`}
                                      onClick={() =>
                                        handleEntrySelect(
                                          item.symbol,
                                          category.id,
                                        )
                                      }
                                    >
                                      {item.symbol}
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  className="dictionary-tree-root"
                  type="button"
                  aria-expanded={isNumberOpen}
                  aria-controls="dictionary-chips-number"
                  onClick={() => setIsNumberOpen((previous) => !previous)}
                >
                  <span>지숫자</span>
                  <span className="dictionary-tree-count">
                    {fingerspellingItems.number.length}
                  </span>
                  <ChevronDown
                    className={`dictionary-tree-chevron ${
                      isNumberOpen ? "is-open" : ""
                    }`}
                    size={18}
                    aria-hidden="true"
                  />
                </button>

                {isNumberOpen && (
                  <ul
                    className="dictionary-chip-grid dictionary-root-chip-grid"
                    id="dictionary-chips-number"
                  >
                    {fingerspellingItems.number.map((item) => {
                      const isSelected = item.symbol === selectedEntry.symbol;

                      return (
                        <li key={item.symbol}>
                          <button
                            className={`dictionary-chip ${
                              isSelected ? "dictionary-chip-selected" : ""
                            }`}
                            type="button"
                            aria-pressed={isSelected}
                            aria-label={`${item.symbol} ${item.name}`}
                            onClick={() =>
                              handleEntrySelect(item.symbol, "number")
                            }
                          >
                            {item.symbol}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <button
                  className="dictionary-tree-root"
                  type="button"
                  aria-expanded={isWordOpen}
                  aria-controls="dictionary-chips-word"
                  onClick={() => setIsWordOpen((previous) => !previous)}
                >
                  <span>단어</span>
                  <span className="dictionary-tree-count">
                    {wordSignEntries.length}
                  </span>
                  <ChevronDown
                    className={`dictionary-tree-chevron ${
                      isWordOpen ? "is-open" : ""
                    }`}
                    size={18}
                    aria-hidden="true"
                  />
                </button>

                {isWordOpen && (
                  <ul
                    className="dictionary-chip-grid dictionary-root-chip-grid"
                    id="dictionary-chips-word"
                  >
                    {wordSignEntries.map((item) => {
                      const isSelected = item.symbol === selectedEntry.symbol;

                      return (
                        <li key={item.id}>
                          <button
                            className={`dictionary-chip dictionary-chip-word ${
                              isSelected ? "dictionary-chip-selected" : ""
                            }`}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => handleEntrySelect(item.symbol, "word")}
                          >
                            {item.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </aside>

          {selectedEntry.categoryId === "word" ? (
            <WordSignDetail
              className="dictionary-detail"
              entry={selectedEntry}
            />
          ) : (
            <FingerspellingDetail
              className="dictionary-detail"
              entry={selectedEntry}
            />
          )}
        </div>
      </main>

      </div>
    </div>
  );
}
