import type { BattleControllerSnapshot } from "../core/BattleController";
import styles from "../battle.module.css";

export function BattleHud({ snapshot }: { readonly snapshot: BattleControllerSnapshot }) {
  return <section className={styles.hud} aria-label="대전 현황">
    <div className={styles.targetMetric}><span>지정 글자</span><strong>{snapshot.targetSymbol ?? "-"}</strong></div>
    <div><span>점수</span><strong>{snapshot.score.toLocaleString()}</strong></div>
    <div><span>콤보</span><strong>{snapshot.combo}</strong></div>
    <div><span>최대 콤보</span><strong>{snapshot.maxCombo}</strong></div>
    <div><span>제거</span><strong>{snapshot.removedCount}</strong></div>
    <p aria-live="polite">{snapshot.message}</p>
  </section>;
}
