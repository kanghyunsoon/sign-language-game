import type { MatchFinishedEvent } from "../transport/battleTransportTypes";
import styles from "../battle.module.css";
import resultStyles from "./BattleResultModal.module.css";
interface BattleResultModalProps { readonly result: MatchFinishedEvent | null; readonly playerId: string; readonly busy?: boolean; readonly error?: string | null; readonly onReturnToWaiting: () => void; readonly onRoomList: () => void; readonly onModeSelect: () => void; }
export function BattleResultModal({ result, playerId, busy = false, error, onReturnToWaiting, onRoomList, onModeSelect }: BattleResultModalProps) {
  if (!result) return null;
  const won = result.winnerPlayerId === playerId; const mine = result.results?.find((entry) => entry.playerId === playerId); const opponent = result.results?.find((entry) => entry.playerId !== playerId);
  return <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="battle-result-title"><section className={styles.resultModal}>
    <span>{won ? "승리" : "패배"}</span><h2 id="battle-result-title">{won ? "대전에서 승리했습니다" : "대전이 종료되었습니다"}</h2>
    <div className={resultStyles.scores}><div><small>내 점수</small><strong>{mine?.score ?? 0}</strong></div><div><small>상대 점수</small><strong>{opponent?.score ?? 0}</strong></div></div>
    <dl className={resultStyles.stats}><div><dt>최대 콤보</dt><dd>{mine?.maxCombo ?? 0}</dd></div><div><dt>제거 수</dt><dd>{mine?.removedCount ?? 0}</dd></div><div><dt>공격 횟수</dt><dd>{mine?.attackCount ?? 0}</dd></div><div><dt>종료 사유</dt><dd>{result.reason}</dd></div></dl>
    {error ? <p role="alert">{error}</p> : null}<div className={resultStyles.actions}><button type="button" disabled={busy} onClick={onReturnToWaiting}>다시 대기방</button><button type="button" disabled={busy} onClick={onRoomList}>방 목록</button><button type="button" disabled={busy} onClick={onModeSelect}>모드 선택</button></div>
  </section></div>;
}
