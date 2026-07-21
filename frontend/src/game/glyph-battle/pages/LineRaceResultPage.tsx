import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useGameModuleContext } from "../../app/GameModuleContext";
import type {
  LineRaceMatchFinishedEvent,
  LineRacePlayerResult,
  LineRaceSymbolStatistic,
} from "../contracts";
import { LineRaceRoomSessionAdapter } from "../session/LineRaceRoomSessionAdapter";
import styles from "./LineRaceGamePage.module.css";
export function LineRaceResultPage() {
  const { matchId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, lineRaceRoomSession, services, setLineRaceRoomSession, lineRaceMediaSession, lineRaceTransport, sharedCameraSession, activePlayerSession } = useGameModuleContext();
  const event =
    (location.state as { result?: LineRaceMatchFinishedEvent } | null)
      ?.result ?? LineRaceRoomSessionAdapter.getResult(matchId);
  if (!event)
    return (
      <main className={styles.page}>
        <h1>경기 결과</h1>
        <p>결과 Event를 찾을 수 없습니다.</p>
        <Link to="/game/line-race">라인 레이스 로비</Link>
      </main>
    );
  const mine = event.results.find((result) => result.playerId === user.userId);
  const opponent = event.results.find(
    (result) => result.playerId !== user.userId,
  );
  const opponentName = lineRaceRoomSession?.participants.find(
    (participant) => participant.userId !== user.userId,
  )?.displayName ?? "상대";
  const title = !event.winnerPlayerId
    ? "무승부"
    : event.winnerPlayerId === user.userId
      ? "승리"
      : "패배";
  const resultCode = !event.winnerPlayerId ? "DRAW" : event.winnerPlayerId === user.userId ? "WIN" : "LOSE";
  const waiting = () =>
    lineRaceRoomSession &&
    navigate(`/game/line-race/rooms/${lineRaceRoomSession.roomId}`);
  const rematch = async () => {
    if (!lineRaceRoomSession || !services.lineRaceRoomGateway) return;
    const bot = lineRaceRoomSession.participants.find((participant) => participant.isBot);
    if (bot && services.lineRaceBotGateway) {
      await services.lineRaceRoomGateway.leaveRoom(lineRaceRoomSession.roomId).catch(() => undefined);
      await lineRaceMediaSession?.disconnect();
      const started = await services.lineRaceBotGateway.create("NORMAL", lineRaceRoomSession.matchDurationMs);
      const room = await services.lineRaceRoomGateway.getRoom(started.roomId);
      setLineRaceRoomSession?.({ ...room, currentUser: user });
      LineRaceRoomSessionAdapter.clearResult(matchId);
      navigate(`/game/line-race/matches/${started.matchId}`);
      return;
    }
    await services.lineRaceRoomGateway.returnToWaiting(
      lineRaceRoomSession.roomId,
    );
    const room = await services.lineRaceRoomGateway.getRoom(
      lineRaceRoomSession.roomId,
    );
    setLineRaceRoomSession?.({ ...room, currentUser: user });
    LineRaceRoomSessionAdapter.clearResult(matchId);
    navigate(`/game/line-race/rooms/${room.roomId}`);
  };
  const exitRoom = async (target: string) => {
    if (lineRaceRoomSession && services.lineRaceRoomGateway) await services.lineRaceRoomGateway.leaveRoom(lineRaceRoomSession.roomId).catch(() => undefined);
    await lineRaceMediaSession?.disconnect();
    lineRaceTransport?.disconnect();
    sharedCameraSession.stop();
    activePlayerSession?.clearRegistration();
    setLineRaceRoomSession?.(null);
    LineRaceRoomSessionAdapter.clearResult(matchId);
    navigate(target);
  };
  return (
    <main className={styles.page}>
      <header>
        <small>턴 배틀 결과</small><strong>{resultCode}</strong>
        <h1>{title}</h1>
        <p>{event.winnerPlayerId ? "상대 체력을 먼저 소진시켰습니다." : "양쪽의 판정 결과가 같습니다."}</p>
      </header>
      <section className={styles.layout}>
        <ResultCard title={`${user.displayName} (나)`} result={mine} />
        <ResultCard title={`${opponentName} (상대)`} result={opponent} />
      </section>
      <div className={styles.actions}>
        <button onClick={() => void rematch()}>재대전</button>
        <button onClick={waiting}>대기방</button>
        <button onClick={() => void exitRoom("/game/line-race")}>턴 배틀 로비</button>
        <button onClick={() => void exitRoom("/game")}>게임 선택</button>
      </div>
    </main>
  );
}
function ResultCard({
  title,
  result,
}: {
  title: string;
  result?: LineRacePlayerResult;
}) {
  if (!result)
    return (
      <article className={styles.panel}>
        <h2>{title}</h2>
        <p>결과 없음</p>
      </article>
    );
  const best = rank(result.symbolStatistics, true),
    practice = rank(result.symbolStatistics, false);
  return (
    <article className={styles.panel}>
      <h2>{title}</h2>
      <ul>
        <li>기술 성공 {result.attacksAccepted}/{result.attacksAttempted}</li>
        <li>
          방어 성공 {result.countersSucceeded}회 / 실패 {Math.max(0, result.countersAttempted - result.countersSucceeded)}회
        </li>
        <li>최대 연속 성공 {result.maxCombo}</li>
        <li>평균 인식 {result.averageRecognitionMs.toFixed(0)}ms</li>
      </ul>
      <p>잘한 지문자: {best?.symbol ?? "-"}</p>
      <p>연습이 필요한 지문자: {practice?.symbol ?? "-"}</p>
    </article>
  );
}
function rank(items: readonly LineRaceSymbolStatistic[], best: boolean) {
  return [...items].sort((a, b) => {
    const left =
        a.recognitionSuccesses + a.attackSuccesses + a.counterSuccesses,
      right = b.recognitionSuccesses + b.attackSuccesses + b.counterSuccesses;
    return best ? right - left : left - right;
  })[0];
}
