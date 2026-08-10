import { Link } from "react-router-dom";

import {
  getNextPracticeCategory,
  practiceFlowLabels,
  type PracticeFlowCategoryId,
} from "../data/practiceFlow";
import { SYMBOLS_PARAM, formatSymbolSelection } from "../data/symbolSelection";

interface PracticeCompletionActionsProps {
  /**
   * 방금 연습한 분류. 오답노트에서 고른 글자만 연습한 경우처럼 분류가 없으면
   * 다음 단계를 알 수 없으므로 [연습하기]를 감춘다.
   */
  readonly categoryId?: string;
  /** 방금 연습한 글자들. 같은 범위를 테스트로 넘길 때 쓴다. */
  readonly symbols: readonly string[];
  /** 같은 범위를 처음부터 다시 연습한다. */
  readonly onRetry: () => void;
  /** 다음 분류 연습으로 넘어간다. 없으면 다음 단계 버튼을 감춘다. */
  readonly onNextCategory?: (categoryId: PracticeFlowCategoryId) => void;
}

/**
 * 연습 완료 안내창의 버튼 묶음. 지문자 연습과 단어 연습이 같은 구성을 쓴다.
 *
 * 선택 페이지로 나가는 길은 넣지 않는다. 안내창이 헤더를 덮지 않아
 * 뒤로가기 버튼으로 언제든 나갈 수 있다.
 */
export function PracticeCompletionActions({
  categoryId,
  symbols,
  onRetry,
  onNextCategory,
}: PracticeCompletionActionsProps) {
  const nextCategory = getNextPracticeCategory(categoryId);
  /* 오답노트가 쓰는 것과 같은 경로다. 설정 화면을 건너뛰고 이 글자들로 바로 출제한다. */
  const testPath = `/test?${SYMBOLS_PARAM}=${encodeURIComponent(
    formatSymbolSelection(symbols),
  )}`;

  return (
    <div className="practice-completion-actions">
      <button type="button" onClick={onRetry}>
        ↻ 다시하기
      </button>

      {symbols.length > 0 && <Link to={testPath}>테스트하기</Link>}

      {nextCategory && onNextCategory && (
        <button type="button" onClick={() => onNextCategory(nextCategory)}>
          {practiceFlowLabels[nextCategory]} 연습하기
        </button>
      )}
    </div>
  );
}
