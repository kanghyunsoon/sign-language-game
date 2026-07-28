


import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGameModuleContext } from "../../app/GameModuleContext";
import type { LineRaceRoomSummary } from "../room";
import styles from "../components/LineRaceRoom.module.css";
import { LineRaceTutorial } from "../components/LineRaceTutorial";

export function LineRaceLobbyPage() {
  const navigate = useNavigate();
  const { config, services, setLineRaceRoomSession } =
    useGameModuleContext();
  const gateway = services.lineRaceRoomGateway;
  const [rooms, setRooms] = useState<readonly LineRaceRoomSummary[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!gateway) return;
    try {
      setRooms(await gateway.getRooms());
      setError(null);
    } catch (cause) {
      setError(message(cause));
    }
  }, [gateway]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(
      () => void load(),
      config.battleRoomPollingIntervalMs ?? 2500,
    );
    return () => window.clearInterval(timer);
  }, [config.battleRoomPollingIntervalMs, load]);
  const join = async (id: string) => {
    if (!gateway) return;
    try {
      const session = await gateway.joinRoom(id);
      setLineRaceRoomSession?.(session);
      navigate("rooms/" + session.roomId);
    } catch (cause) {
      setError(message(cause));
    }
  };
  const joinCode = async () => {
    if (!gateway || !code.trim()) return;
    try {
      const session = await gateway.joinByCode(code);
      setLineRaceRoomSession?.(session);
      navigate("rooms/" + session.roomId);
    } catch (cause) {
      setError(message(cause));
    }
  };
  const startTurnBotPractice = () => navigate("practice");
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <small>실시간 1:1</small>
          <h1>지문자 턴 배틀</h1>
          <p>서로의 기술을 숨겨 선택하고, 지문자 상성과 전략으로 승부하세요.</p>
        </div>
        <div className={styles.actions}>
          <Link to="/game">게임 선택으로 돌아가기</Link>
          <Link className={styles.primary} to="create">
            방 만들기
          </Link>
        </div>
      </header>
      <LineRaceTutorial />
      <div className={styles.toolbar}>
        <div>
          <div>
            <input
              aria-label="방 코드"
              placeholder="비공개 방 코드"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
            <button onClick={() => void joinCode()}>코드 참가</button>
          </div>
          <button type="button" onClick={startTurnBotPractice}>봇전</button>
        </div>
        <div className={styles.actions}>
          <button onClick={() => void load()}>새로고침</button>
        </div>
      </div>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <section className={styles.grid}>
        {rooms.map((room) => (
          <article className={styles.card} key={room.roomId}>
            <h2>{room.title}</h2>
            <p className={styles.meta}>
              <span>{room.playerCount}/2명</span>
              <span>{room.matchDurationMs / 1000}초</span>
              <span>{room.symbolRange.join(" ")}</span>
            </p>
            <button
              disabled={!room.canJoin}
              onClick={() => void join(room.roomId)}
            >
              참가
            </button>
          </article>
        ))}
        {rooms.length === 0 ? (
          <p className={styles.empty}>현재 참가 가능한 공개방이 없습니다.</p>
        ) : null}
      </section>
    </main>
  );
}
function message(cause: unknown) {
  return cause instanceof Error ? cause.message : "방 요청에 실패했습니다.";
}
