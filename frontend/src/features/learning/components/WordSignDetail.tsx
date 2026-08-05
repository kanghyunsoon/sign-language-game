import "./FingerspellingDetail.css";
import type { ReactNode } from "react";
import { DetailStepper, type DetailStepperProps } from "./DetailStepper";
import { WordSignVideo } from "./WordSignVideo";

/**
 * 카드가 실제로 쓰는 필드만 받는다. 사전의 WordSignEntry는 물론,
 * 테스트 문항처럼 일부 정보만 가진 객체도 그대로 넘길 수 있다.
 */
export interface WordSignDetailEntry {
  readonly name: string;
  readonly video: string;
  readonly description: readonly string[];
  readonly categoryLabel?: string;
  /** 소분류 표시 이름. 없으면 배지에 "단어"만 보여준다. */
  readonly groupLabel?: string;
}

interface WordSignDetailProps extends DetailStepperProps {
  readonly entry: WordSignDetailEntry;
  readonly className?: string;
  readonly footer?: ReactNode;
}

export function WordSignDetail({
  entry,
  className,
  footer,
  onPrevious,
  onNext,
  unitLabel,
}: WordSignDetailProps) {
  return (
    <section
      className={`fingerspelling-detail word-sign-detail${
        className ? ` ${className}` : ""
      }`}
      aria-live="polite"
    >
      <DetailStepper onPrevious={onPrevious} onNext={onNext} unitLabel={unitLabel} />

      <span className="fingerspelling-detail-badge">
        {entry.categoryLabel === "문장"
          ? "문장"
          : entry.groupLabel
            ? `단어 · ${entry.groupLabel}`
            : "단어"}
      </span>
      <h2 className="fingerspelling-detail-symbol">{entry.name}</h2>
      <div className="fingerspelling-detail-image word-sign-detail-video">
        {entry.video ? (
          <WordSignVideo src={entry.video} label={`${entry.name} 수어 동작 영상`} />
        ) : (
          <p className="word-sign-detail-video-empty">
            수어 영상을 준비하고 있어요.
          </p>
        )}
      </div>

      {entry.description.length > 0 && (
        <div className="fingerspelling-detail-description">
          {entry.description.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </div>
      )}
      {footer ? (
        <div className="fingerspelling-detail-footer">{footer}</div>
      ) : null}
    </section>
  );
}
