import type { CSSProperties } from "react";
import { AlertTriangle, Check, Crosshair, Hand, LoaderCircle, Radio, RefreshCw } from "lucide-react";
import type { LineRaceUserFeedbackView } from "../feedback";
import styles from "./LineRaceRecognition.module.css";

export function LineRaceActionFeedbackBanner({ feedback }: { readonly feedback: LineRaceUserFeedbackView }) {
  const Icon = feedback.state === "SUCCESS" ? Check
    : feedback.state === "REJECTED" || feedback.state === "AMBIGUOUS" || feedback.state === "DISCONNECTED" ? AlertTriangle
      : feedback.state === "RELEASE_REQUIRED" ? Hand
        : feedback.state === "RESULT_UNKNOWN" ? RefreshCw
          : ["RECOGNIZING", "CONFIRMING", "ACTION_PENDING"].includes(feedback.state) ? LoaderCircle
            : feedback.target.kind === "COUNTER" ? Crosshair : Radio;
  const progress = feedback.recognitionProgress ?? 0;
  return <section className={`${styles.actionBanner} ${styles[`action${feedback.state}`]}`} aria-live="polite" data-state={feedback.state} data-effect-key={feedback.effectKey}>
    <span className={styles.actionRing} style={{ "--recognition-progress": `${Math.round(progress * 360)}deg` } as CSSProperties}><Icon size={22} aria-hidden="true" /></span>
    <div><strong>{stateLabel(feedback)}</strong><span>{feedback.message}</span></div>
    {["RECOGNIZING", "CONFIRMING"].includes(feedback.state) ? <div className={styles.progressTrack} role="progressbar" aria-label="지문자 인식 진행"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><i style={{ width: `${Math.round(progress * 100)}%` }} /></div> : null}
  </section>;
}

function stateLabel(feedback: LineRaceUserFeedbackView): string {
  if (feedback.state === "HAND_NOT_VISIBLE") return "손을 찾고 있어요";
  if (feedback.state === "RECOGNIZING") return `인식 중 · ${feedback.symbol ?? "손 모양"}`;
  if (feedback.state === "CONFIRMING") return `확정 직전 · ${feedback.symbol ?? "손 모양"}`;
  if (feedback.state === "CONFIRMED") return "지문자 확인";
  if (feedback.state === "ACTION_PENDING") return "서버 판정 대기";
  if (feedback.state === "SUCCESS") return feedback.actionKind === "COUNTER" ? "카운터 성공" : "공격 승인";
  if (feedback.state === "REJECTED") return "행동 거절";
  if (feedback.state === "RELEASE_REQUIRED") return "다음 동작 준비";
  if (feedback.state === "RESULT_UNKNOWN") return "서버 상태 동기화 완료";
  if (feedback.state === "AMBIGUOUS") return "손 모양을 다시 확인해 주세요";
  if (feedback.state === "DISCONNECTED") return "연결 확인 중";
  if (feedback.target.kind === "COUNTER") return `카운터 우선 · ${feedback.target.primarySymbol}`;
  if (feedback.target.kind === "ATTACK") return "공격 목표";
  return "입력 대기";
}
