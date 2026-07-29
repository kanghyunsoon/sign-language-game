import "./FingerspellingDetail.css";
import type { ReactNode } from "react";
import type { FingerspellingEntry } from "../data/fingerspelling";

interface FingerspellingDetailProps {
  /** 표시할 지문자 항목. */
  readonly entry: FingerspellingEntry;
  /** 페이지별 크기·여백 보정을 위한 추가 클래스. */
  readonly className?: string;
  /** 수형 설명 아래에 덧붙일 영역. 사전은 쓰지 않고 테스트 결과만 사용한다. */
  readonly footer?: ReactNode;
}

/**
 * 지문자 한 글자의 상세 정보(분류·글자·이름·동작 사진·수형 설명) 패널.
 * 사전 페이지와 테스트 결과 화면이 동일한 구조·스타일로 공유한다.
 */
export function FingerspellingDetail({
  entry,
  className,
  footer,
}: FingerspellingDetailProps) {
  return (
    <section
      className={
        className
          ? `fingerspelling-detail ${className}`
          : "fingerspelling-detail"
      }
      aria-live="polite"
    >
      <span className="fingerspelling-detail-badge">
        지문자 · {entry.categoryLabel}
      </span>

      <h2 className="fingerspelling-detail-symbol">{entry.symbol}</h2>

      <p className="fingerspelling-detail-name">{entry.name}</p>

      <div className="fingerspelling-detail-image">
        <img src={entry.image} alt={`${entry.name} 지문자 동작`} />
      </div>

      <div className="fingerspelling-detail-description">
        {/* <h3>수형 설명</h3> */}

        {entry.description.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </div>

      {footer ? (
        <div className="fingerspelling-detail-footer">{footer}</div>
      ) : null}
    </section>
  );
}
