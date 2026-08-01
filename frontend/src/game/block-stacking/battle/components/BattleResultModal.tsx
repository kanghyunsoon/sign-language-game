import type { MatchFinishedEvent } from "../transport/battleTransportTypes";
import winnerOtter from "../../assets/battle-result-winner-otter.png";
import loserOtter from "../../assets/battle-result-loser-otter.png";
import styles from "../battle.module.css";
import resultStyles from "./BattleResultModal.module.css";

interface BattleResultModalProps {
  readonly result: MatchFinishedEvent | null;
  readonly playerId: string;
  readonly busy?: boolean;
  readonly readyForRematch?: boolean;
  readonly error?: string | null;
  readonly onReturnToWaiting: () => void;
  readonly onRoomList: () => void;
}

export function BattleResultModal({
  result,
  playerId,
  busy = false,
  readyForRematch = true,
  error,
  onReturnToWaiting,
  onRoomList,
}: BattleResultModalProps) {
  if (!result) return null;

  const won = result.winnerPlayerId === playerId;
  const mine = result.results?.find((entry) => entry.playerId === playerId);
  const opponent = result.results?.find((entry) => entry.playerId !== playerId);
  const winner = won ? mine : opponent;
  const runnerUp = won ? opponent : mine;

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="battle-result-title">
      <section className={resultStyles.resultStage}>
        <header className={resultStyles.resultHeader}>
          <span className={resultStyles.modeBadge}>프링글수 · 1 VS 1</span>
          <div>
            <h2 id="battle-result-title">{won ? "승리했어요!" : "다음 판엔 이겨봐요!"}</h2>
            <p>{won ? "상대보다 먼저 결승선에 도달했어요. 멋진 플레이였어요!" : "마지막까지 잘 버텼어요. 다음 판에는 더 높은 콤보를 노려봐요!"}</p>
          </div>
          <strong className={resultStyles.resultScore}>최종 점수 <b>{mine?.score ?? 0}점</b></strong>
        </header>

        <div className={resultStyles.playerCards}>
          <ResultCard
            label="WINNER"
            name={won ? "나" : "상대"}
            score={winner?.score ?? 0}
            result={winner}
            reason={result.reason}
            image={winnerOtter}
            highlighted
          />
          <span className={resultStyles.vs}>VS</span>
          <ResultCard
            label="RUNNER-UP"
            name={won ? "상대" : "나"}
            score={runnerUp?.score ?? 0}
            result={runnerUp}
            reason={result.reason}
            image={loserOtter}
          />
        </div>

        {error ? <p className={resultStyles.error} role="alert">{error}</p> : null}
        {!readyForRematch && !error ? <p role="status">결과 저장 확인 중입니다.</p> : null}

        <footer className={resultStyles.actions}>
          <button type="button" disabled={busy || !readyForRematch} onClick={onReturnToWaiting}>다시 하기</button>
          <button type="button" disabled={busy} onClick={onReturnToWaiting}>같은 방으로</button>
          <button type="button" disabled={busy} onClick={onRoomList}>게임방 목록</button>
        </footer>
      </section>
    </div>
  );
}

function ResultCard({
  label,
  name,
  score,
  result,
  image,
  reason,
  highlighted = false,
}: {
  readonly label: string;
  readonly name: string;
  readonly score: number;
  readonly result: { readonly score: number; readonly maxCombo: number; readonly removedCount: number; readonly attackCount?: number } | undefined;
  readonly image: string;
  readonly reason: string;
  readonly highlighted?: boolean;
}) {
  return (
    <article className={[resultStyles.playerCard, highlighted ? resultStyles.highlighted : ""].filter(Boolean).join(" ")}>
      <header><span>{name}</span><em>{label}</em></header>
      <div className={resultStyles.scoreRow}>
        <img src={image} alt={label === "WINNER" ? "웃는 수달" : "우는 수달"} draggable={false} />
        <strong><small>최종 점수</small>{score.toLocaleString()}점</strong>
      </div>
      <dl>
        <div><dt>제거 블록</dt><dd>{result?.removedCount ?? 0}개</dd></div>
        <div><dt>최고 콤보</dt><dd>{result?.maxCombo ?? 0} COMBO</dd></div>
        <div><dt>공격 횟수</dt><dd>{result?.attackCount ?? 0}회</dd></div>
        <div><dt>종료 사유</dt><dd>{formatReason(reason)}</dd></div>
      </dl>
    </article>
  );
}

function formatReason(reason: string): string {
  if (reason === "FORFEIT") return "상대 기권";
  if (reason === "RECONNECT_TIMEOUT") return "재접속 시간 초과";
  return reason === "GAME_OVER" || reason === "DANGER_LINE" ? "결승선 도달" : reason === "DISCONNECTED" ? "연결 종료" : "게임 종료";
}
