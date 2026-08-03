import "./FingerspellingDetail.css";
import type { ReactNode } from "react";
import type { WordSignEntry } from "../data/wordSigns";
import { WordSignVideo } from "./WordSignVideo";

interface WordSignDetailProps {
  readonly entry: WordSignEntry;
  readonly className?: string;
  readonly footer?: ReactNode;
}

export function WordSignDetail({
  entry,
  className,
  footer,
}: WordSignDetailProps) {
  return (
    <section
      className={`fingerspelling-detail word-sign-detail${
        className ? ` ${className}` : ""
      }`}
      aria-live="polite"
    >
      <span className="fingerspelling-detail-badge">단어</span>
      <h2 className="fingerspelling-detail-symbol">{entry.name}</h2>
      <div className="fingerspelling-detail-image word-sign-detail-video">
        <WordSignVideo src={entry.video} label={`${entry.name} 수어 동작 영상`} />
      </div>
      {footer ? (
        <div className="fingerspelling-detail-footer">{footer}</div>
      ) : null}
    </section>
  );
}
