import "./DictionaryPage.css";
import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { ChevronDown, Search, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import otterCharacter from "../../../game/block-stacking/assets/game-menu-otter.png";
import { FingerspellingDetail } from "../components/FingerspellingDetail";
import type { FingerspellingCategoryId } from "../data/fingerspelling";
import {
  DEFAULT_FINGERSPELLING_SYMBOL,
  fingerspellingCategories,
  fingerspellingEntries,
  fingerspellingItems,
  findFingerspellingEntry,
  searchFingerspellingEntries,
} from "../data/fingerspelling";

/** 분류별 펼침 상태. 사전 진입 시 자음만 펼쳐 둔다. */
const initialOpenCategoryMap: Record<FingerspellingCategoryId, boolean> = {
  consonant: true,
  vowel: false,
  number: false,
};

export function DictionaryPage() {
  const [dictionaryScale, setDictionaryScale] = useState(1);
  const [selectedSymbol, setSelectedSymbol] = useState(
    DEFAULT_FINGERSPELLING_SYMBOL,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isFingerspellingOpen, setIsFingerspellingOpen] = useState(true);
  const [openCategoryMap, setOpenCategoryMap] = useState(
    initialOpenCategoryMap,
  );
  const [comingSoonMenu, setComingSoonMenu] = useState<"테스트" | null>(null);

  const isSearching = searchQuery.trim().length > 0;

  useEffect(() => {
    const updateDictionaryScale = () => {
      setDictionaryScale(
        Math.min(window.innerWidth / 1920, window.innerHeight / 1200),
      );
    };

    updateDictionaryScale();
    window.addEventListener("resize", updateDictionaryScale);
    return () => window.removeEventListener("resize", updateDictionaryScale);
  }, []);
  const searchResults = isSearching
    ? searchFingerspellingEntries(searchQuery)
    : [];
  // 알 수 없는 글자가 남아도 항상 유효한 항목을 보여준다.
  const selectedEntry =
    findFingerspellingEntry(selectedSymbol) ?? fingerspellingEntries[0];

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSearchClear = () => {
    setSearchQuery("");
  };

  const handleFingerspellingToggle = () => {
    setIsFingerspellingOpen((previous) => !previous);
  };

  const handleCategoryToggle = (categoryId: FingerspellingCategoryId) => {
    setOpenCategoryMap((previous) => ({
      ...previous,
      [categoryId]: !previous[categoryId],
    }));
  };

  /** 항목을 선택하고, 분류 트리에서 해당 항목이 보이도록 펼친다. */
  const handleEntrySelect = (
    symbol: string,
    categoryId: FingerspellingCategoryId,
  ) => {
    setSelectedSymbol(symbol);
    setIsFingerspellingOpen(true);
    setOpenCategoryMap((previous) => ({ ...previous, [categoryId]: true }));
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
        <nav className="dictionary-nav" aria-label="주요 메뉴">
          <Link to="/main">메인페이지</Link>
          <Link to="/practice">연습</Link>
          <button type="button" onClick={() => setComingSoonMenu("테스트")}>
            테스트
          </button>
          <Link className="active" to="/dictionary">
            사전
          </Link>
          <Link to="/game">게임</Link>
        </nav>

        <Link className="dictionary-mypage-button" to="/profile">
          마이페이지
        </Link>
      </header>

      <main className="dictionary-main">
        <div className="dictionary-heading">
          <span className="dictionary-badge">DICTIONARY</span>
          <h1>수어 사전</h1>
          <p>자음·모음·숫자 지문자를 검색하고 수형을 확인해 보세요.</p>
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
                placeholder="ㄱ, 기역, 1 처럼 입력해 보세요"
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
                    {fingerspellingCategories.map((category) => {
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
              </div>
            )}
          </aside>

          <FingerspellingDetail entry={selectedEntry} />
        </div>
      </main>

      {comingSoonMenu ? (
        <div className="dictionary-coming-soon-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComingSoonMenu(null); }}>
          <section className="dictionary-coming-soon-dialog" role="dialog" aria-modal="true" aria-labelledby="dictionary-coming-soon-title">
            <button type="button" className="dictionary-coming-soon-close" aria-label="팝업 닫기" onClick={() => setComingSoonMenu(null)}><X aria-hidden="true" size={20} /></button>
            <Sparkles className="dictionary-coming-soon-sparkle" aria-hidden="true" size={30} />
            <img src={otterCharacter} alt="" />
            <h2 id="dictionary-coming-soon-title">수달이 개발중..</h2>
            <p>조금만 기다려 주세요!<br />{comingSoonMenu} 기능을 만들고 있어요.</p>
            <button type="button" className="dictionary-coming-soon-confirm" onClick={() => setComingSoonMenu(null)}>기다릴게!</button>
          </section>
        </div>
      ) : null}
      </div>
    </div>
  );
}
