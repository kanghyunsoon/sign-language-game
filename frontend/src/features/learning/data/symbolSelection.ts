import type { LearningEntry } from "./learningEntries";
import { findLearningEntry } from "./learningEntries";

/**
 * 오답노트가 연습·테스트로 글자 묶음을 넘길 때 쓰는 query parameter 이름.
 * 보내는 쪽(ReviewNotesPage)과 받는 쪽이 같은 상수를 참조하도록 여기에 둔다.
 */
export const SYMBOLS_PARAM = "symbols";

/** 여러 글자를 한 파라미터에 담을 때 쓰는 구분자. */
const SYMBOL_SEPARATOR = ",";

/**
 * `?symbols=ㄱ,ㄴ` 형태의 파라미터를 지문자 항목 목록으로 바꾼다.
 *
 * 사용자가 URL을 직접 고칠 수 있으므로 방어적으로 다룬다.
 * - 공백만 있는 조각과 사전에 없는 글자는 버린다.
 * - 같은 글자가 여러 번 오면 한 번만 남긴다(문항이 중복 출제되지 않도록).
 * - 넘어온 순서를 유지한다. 섞는 것은 호출하는 쪽이 판단한다.
 */
export function parseSymbolSelection(
  raw: string | null | undefined,
): LearningEntry[] {
  if (!raw) return [];

  const seen = new Set<string>();
  const entries: LearningEntry[] = [];

  for (const piece of raw.split(SYMBOL_SEPARATOR)) {
    const symbol = piece.trim();
    if (!symbol || seen.has(symbol)) continue;

    const entry = findLearningEntry(symbol);
    if (!entry) continue;

    seen.add(symbol);
    entries.push(entry);
  }

  return entries;
}

/** 글자 목록을 query parameter 값으로 만든다. 보내는 쪽에서 사용한다. */
export function formatSymbolSelection(symbols: readonly string[]): string {
  return symbols.join(SYMBOL_SEPARATOR);
}
