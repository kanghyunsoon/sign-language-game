import { useId } from "react";
import { createPortal } from "react-dom";

import otterClapImage from "../assets/otter_clap.png";

/**
 * 정답 안내창이 머문 뒤 다음 문제로 넘어가기까지의 시간.
 * 연습·단어 연습·테스트가 같은 값을 쓴다.
 */
export const CORRECT_AUTO_ADVANCE_SECONDS = 1;

interface CorrectFeedbackModalProps {
  readonly symbol: string;
  readonly onClose: () => void;
}

export function CorrectFeedbackModal({
  symbol,
  onClose,
}: CorrectFeedbackModalProps) {
  const titleId = useId();

  return createPortal(
    <div
      className="practice-correct-overlay correct-feedback-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <section className="practice-correct-card">
        <button
          className="practice-correct-close"
          type="button"
          aria-label="정답 안내 닫기"
          onClick={onClose}
        >
          ×
        </button>
        <img src={otterClapImage} alt="정답을 축하하며 박수치는 수달" />
        <h2 id={titleId}>맞췄습니다!</h2>
        <p>AI가 '{symbol}' 동작을 정확히 인식했어요.</p>
      </section>
    </div>,
    document.body,
  );
}
