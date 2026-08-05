import { useCallback, useSyncExternalStore } from "react";

import {
  fingerspellingCategories,
  fingerspellingItems,
} from "./fingerspelling";
import type { LearningEntry } from "./learningEntries";
import { findLearningEntry } from "./learningEntries";
import { wordSignEntries } from "./wordSigns";
import { sentenceSignEntries } from "./sentenceSigns";

/**
 * 오답노트 저장소.
 *
 * 백엔드 오답노트 API가 아직 없어 localStorage에 심볼 목록만 담아 둔다.
 * 화면은 아래 훅과 조작 함수만 사용하므로, 나중에 API로 바꿀 때
 * 이 파일의 read/write 구현만 교체하면 된다.
 */
const STORAGE_KEY = "handpractice.reviewNotes";

/** localStorage를 못 쓰는 환경(SSR·프라이빗 모드)에서 쓰는 대체 저장소. */
let memoryFallback: string[] | null = null;

/** 마지막으로 읽어 둔 심볼 목록. useSyncExternalStore가 같은 참조를 받도록 캐시한다. */
let cachedSymbols: readonly string[] | null = null;

const listeners = new Set<() => void>();

function readStorage(): string[] {
  if (memoryFallback) return memoryFallback;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // 저장된 뒤 사전에서 사라진 글자는 걸러낸다.
    return parsed.filter(
      (symbol): symbol is string =>
        typeof symbol === "string" && findLearningEntry(symbol) !== undefined,
    );
  } catch {
    return [];
  }
}

function writeStorage(symbols: readonly string[]) {
  cachedSymbols = symbols;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // 저장이 막힌 환경에서도 화면 동작은 유지한다.
    memoryFallback = [...symbols];
  }

  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 저장된 심볼 목록. 내용이 바뀌지 않았다면 같은 배열 참조를 돌려준다. */
function getSymbolSnapshot(): readonly string[] {
  if (!cachedSymbols) cachedSymbols = readStorage();
  return cachedSymbols;
}

/** 오답노트에 글자를 추가한다. 이미 있으면 아무 일도 하지 않는다. */
export function addReviewNote(symbol: string) {
  const symbols = getSymbolSnapshot();
  if (symbols.includes(symbol)) return;
  if (!findLearningEntry(symbol)) return;

  writeStorage([...symbols, symbol]);
}

/** 오답노트에서 여러 글자를 한 번에 뺀다. */
export function removeReviewNotes(symbolsToRemove: readonly string[]) {
  const removalSet = new Set(symbolsToRemove);
  const symbols = getSymbolSnapshot();
  const next = symbols.filter((symbol) => !removalSet.has(symbol));
  if (next.length === symbols.length) return;

  writeStorage(next);
}

/**
 * 사전 순서에서 각 글자가 몇 번째인지 미리 계산해 둔다.
 * 자음(ㄱ-ㄴ-ㄷ...) → 모음(ㅏ-ㅑ-ㅓ...) → 숫자(1-2-3...) 순서가 된다.
 */
const dictionaryOrderBySymbol = new Map<
  string,
  { category: string; index: number }
>(
  [
    ...fingerspellingCategories.flatMap((category) =>
      fingerspellingItems[category.id].map(
        (item, index) => [item.symbol, { category: category.id, index }] as const,
      ),
    ),
    ...wordSignEntries.map(
      (item, index) => [item.symbol, { category: "word", index }] as const,
    ),
    ...sentenceSignEntries.map(
      (item, index) => [item.symbol, { category: "sentence", index }] as const,
    ),
  ],
);

const categoryOrder = [
  ...fingerspellingCategories.map((category) => category.id),
  "word",
  "sentence",
];

/** 사전과 같은 순서로 비교한다. 목록이 담은 순서에 흔들리지 않게 한다. */
function compareByDictionaryOrder(
  left: LearningEntry,
  right: LearningEntry,
): number {
  const leftPlace = dictionaryOrderBySymbol.get(left.symbol);
  const rightPlace = dictionaryOrderBySymbol.get(right.symbol);

  if (!leftPlace || !rightPlace) return 0;

  const categoryGap =
    categoryOrder.indexOf(leftPlace.category) -
    categoryOrder.indexOf(rightPlace.category);

  return categoryGap !== 0 ? categoryGap : leftPlace.index - rightPlace.index;
}

/**
 * 오답노트에 담긴 지문자 항목 목록.
 * 담은 순서가 아니라 사전 순서(자음 → 모음 → 숫자)로 정렬해 찾기 쉽게 한다.
 */
export function useReviewNotes(): readonly LearningEntry[] {
  const symbols = useSyncExternalStore(subscribe, getSymbolSnapshot, () => EMPTY_SYMBOLS);

  return symbols
    .map((symbol) => findLearningEntry(symbol))
    .filter((entry): entry is LearningEntry => entry !== undefined)
    .sort(compareByDictionaryOrder);
}

/** 서버 렌더링 스냅샷. 매번 같은 참조여야 하므로 모듈 상수로 둔다. */
const EMPTY_SYMBOLS: readonly string[] = [];

/** 오답노트 항목을 삭제하는 콜백. 컴포넌트에서 안정적인 참조로 쓰려고 훅으로 감쌌다. */
export function useRemoveReviewNotes() {
  return useCallback(
    (symbols: readonly string[]) => removeReviewNotes(symbols),
    [],
  );
}
