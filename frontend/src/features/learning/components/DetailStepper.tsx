import { ChevronLeft, ChevronRight } from "lucide-react";

interface DetailStepperProps {
  /** 이전 항목으로 이동. 없으면 버튼이 비활성화된다. */
  readonly onPrevious?: () => void;
  /** 다음 항목으로 이동. 없으면 버튼이 비활성화된다. */
  readonly onNext?: () => void;
  /** 읽어 줄 대상 이름. "이전 글자" / "다음 단어"처럼 쓰인다. */
  readonly unitLabel?: string;
}

/**
 * 상세 카드 상단 양 끝에 붙는 이전/다음 이동 버튼.
 * 사전과 오답노트가 같은 모양으로 쓴다.
 */
export function DetailStepper({
  onPrevious,
  onNext,
  unitLabel = "글자",
}: DetailStepperProps) {
  return (
    <div className="detail-stepper">
      <button
        className="detail-stepper-button detail-stepper-previous"
        type="button"
        disabled={!onPrevious}
        aria-label={`이전 ${unitLabel}`}
        onClick={onPrevious}
      >
        <ChevronLeft aria-hidden="true" />
      </button>

      <button
        className="detail-stepper-button detail-stepper-next"
        type="button"
        disabled={!onNext}
        aria-label={`다음 ${unitLabel}`}
        onClick={onNext}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
