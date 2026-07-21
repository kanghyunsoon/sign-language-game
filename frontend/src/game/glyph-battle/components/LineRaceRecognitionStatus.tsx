import type { KeyboardSignRecognizer } from "../../recognition";
import type { LineRaceInputState } from "../recognition";
import { isLineRaceDevHarnessEnabled } from "../core";
import styles from "./LineRaceRecognition.module.css";

export function LineRaceRecognitionStatus({ input, symbols, keyboard }: { readonly input: LineRaceInputState; readonly symbols: readonly string[]; readonly keyboard?: KeyboardSignRecognizer }) {
  return (
    <section className={styles.panel} aria-labelledby="recognition-status-title">
      <h2 id="recognition-status-title">인식 상태</h2>
      <dl className={styles.statusGrid}>
        <dt>손 인식</dt><dd>{input.connectionState === "CONNECTED" ? "준비됨" : "연결 확인 중"}</dd>
        <dt>최근 확인</dt><dd>{input.confirmedSymbol ?? "아직 없음"}</dd>
        <dt>다음 입력</dt><dd>{input.lockedSymbol ? "손을 편하게 풀어 주세요" : "입력 가능"}</dd>
      </dl>
      {input.error ? <p role="alert" className={styles.error}>{input.error}</p> : null}
      {import.meta.env.DEV ? <details>
        <summary>문맥 후보 진단</summary>
        <dl className={styles.statusGrid}>
          <dt>Raw top-1</dt><dd>{input.contextual ? `${input.contextual.rawTop1.symbol} ${(input.contextual.rawTop1.confidence * 100).toFixed(1)}%` : "-"}</dd>
          <dt>문맥 선택</dt><dd>{input.contextual?.selectedCandidate ? `${input.contextual.selectedCandidate.symbol} ${(input.contextual.selectedCandidate.confidence * 100).toFixed(1)}%` : "-"}</dd>
          <dt>Eligible</dt><dd>{input.contextual?.eligibleSymbols.join(" · ") || "없음"}</dd>
          <dt>Threshold</dt><dd>{input.contextual?.selectedThreshold?.toFixed(3) ?? "-"}</dd>
          <dt>Margin</dt><dd>{input.contextual?.margin?.toFixed(3) ?? "-"}</dd>
          <dt>거절</dt><dd>{input.contextual?.rejectionReason ?? "-"}</dd>
          <dt>입력 판정</dt><dd>{input.feedback.message}</dd>
        </dl>
      </details> : null}
      {isLineRaceDevHarnessEnabled() && keyboard ? <div className={styles.keyboard} aria-label="개발용 키보드 지문자 입력">
        <p>개발 입력: 숫자 1~0, Q, W 또는 아래 버튼</p>
        <div>{symbols.map((symbol) => <button type="button" key={symbol} onClick={() => keyboard.confirmSymbol(symbol)}>{symbol}</button>)}</div>
        <button type="button" onClick={() => keyboard.releaseHand()}>HAND_RELEASED</button>
      </div> : null}
    </section>
  );
}
