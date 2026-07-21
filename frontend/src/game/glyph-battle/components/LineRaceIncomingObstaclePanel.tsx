import type { LineRaceInputContext } from "../recognition";
import type { LineRaceUserFeedbackView } from "../feedback";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";
import styles from "./LineRaceRecognition.module.css";

export function LineRaceIncomingObstaclePanel({ context, userFeedback: _userFeedback, duelView }: {
  readonly context: LineRaceInputContext;
  readonly baseSpeedPerSecond: number;
  readonly userFeedback: LineRaceUserFeedbackView;
  readonly duelView?: GlyphDuelView;
}) {
  const opponentLocked = Boolean(context.counterableObstacles[0]) || duelView?.phase === "WAITING" || duelView?.phase === "REVEAL";
  return <section className={`${styles.panel} ${styles.turnStatus}`} aria-labelledby="opponent-choice-title">
    <span>상대 선택</span><h2 id="opponent-choice-title">{opponentLocked ? "기술 확정 완료" : "선택 중"}</h2>
    <div className={styles.hiddenChoice} data-locked={opponentLocked}><strong>?</strong></div>
    <p>{opponentLocked ? "두 선택이 모두 잠기면 동시에 공개됩니다." : "상대 기술과 속성은 공개 전까지 보이지 않습니다."}</p>
  </section>;
}
