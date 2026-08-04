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
   * 다음 단계를 알 수 없으므로 [다음 단계 연습하기]를 감춘다.
   */
  readonly categoryId?: string;
  /** 방금 연습한 글자들. 같은 범위를 테스트로 넘길 때 쓴다. */
  readonly symbols: readonly string[];
  /** 다음 분류 연습으로 넘어간다. 없으면 다음 단계 버튼을 감춘다. */
  readonly onNextCategory?: (categoryId: PracticeFlowCategoryId) => void;
  /** 연습을 벗어난다. 들어온 곳(선택 페이지 또는 오답노트)으로 되돌리는 몫이다. */
  readonly onExit?: () => void;
  /** 나가기 버튼 이름. 오답노트에서 들어왔으면 "오답노트로"처럼 바꿔 준다. */
  readonly exitLabel?: string;
}

/**
 * 연습 완료 안내창의 버튼 묶음. 지문자 연습과 단어 연습이 같은 구성을 쓴다.
 *
 * 최대 세 개까지만 둔다. [다시하기]는 방금 끝낸 범위를 곧바로 또 하는 경우가
 * 드물어 넣지 않았다. 선택 페이지에서 같은 분류를 다시 고르면 된다.
 */
export function PracticeCompletionActions({
  categoryId,
  symbols,
  onNextCategory,
  onExit,
  exitLabel = "선택 페이지로",
}: PracticeCompletionActionsProps) {
  const nextCategory = getNextPracticeCategory(categoryId);
  const currentLabel = categoryId
    ? practiceFlowLabels[categoryId as PracticeFlowCategoryId]
    : undefined;
  /* 오답노트가 쓰는 것과 같은 경로다. 설정 화면을 건너뛰고 이 글자들로 바로 출제한다. */
  const testPath = `/test?${SYMBOLS_PARAM}=${encodeURIComponent(
    formatSymbolSelection(symbols),
  )}`;

  return (
    <div className="practice-completion-actions">
      {nextCategory && onNextCategory && (
        <button type="button" onClick={() => onNextCategory(nextCategory)}>
          {practiceFlowLabels[nextCategory]} 연습하기 →
        </button>
      )}

      {symbols.length > 0 && (
        <Link to={testPath}>
          {currentLabel ? `${currentLabel} 테스트하러 가기` : "테스트하러 가기"}
        </Link>
      )}

      {onExit ? (
        <button type="button" onClick={onExit}>
          {exitLabel}
        </button>
      ) : (
        <Link to="/practice">{exitLabel}</Link>
      )}
    </div>
  );
}
