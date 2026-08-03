import "./FingerspellingDetail.css";
import type { ReactNode } from "react";
import type { WordSignEntry } from "../data/wordSigns";
import { WordSignVideo } from "./WordSignVideo";

interface WordSignDetailProps {
  readonly entry: WordSignEntry;
  readonly className?: string;
  readonly footer?: ReactNode;
  /** 카드 상단 양 끝에 놓을 이전/다음 이동 버튼. */
  readonly stepper?: ReactNode;
}

export function WordSignDetail({
  entry,
  className,
  footer,
  stepper,
}: WordSignDetailProps) {
  return (
    <section
      className={`fingerspelling-detail word-sign-detail${
        className ? ` ${className}` : ""
      }`}
      aria-live="polite"
    >
      {stepper}

      <span className="fingerspelling-detail-badge">
        {entry.groupLabel ? `단어 · ${entry.groupLabel}` : "단어"}
      </span>
      <h2 className="fingerspelling-detail-symbol">{entry.name}</h2>
      <div className="fingerspelling-detail-image word-sign-detail-video">
        <WordSignVideo src={entry.video} label={`${entry.name} 수어 동작 영상`} />
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
