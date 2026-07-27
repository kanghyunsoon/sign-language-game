import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import { BattleRoomCard } from "../battle/components/BattleRoomCard";
import { CreateRoomModal } from "../battle/components/CreateRoomModal";
import styles from "../battle/components/BattleRoomUi.module.css";
import type { BattleRoomSummary, CreateRoomRequest } from "../battle/room";

const DEFAULT_POLLING_INTERVAL_MS = 2_500;

export function BattleRoomListPage({ mode = "BLOCK" }: { readonly mode?: "BLOCK" | "TURN" }) {
  const navigate = useNavigate();
  const { config, services, setBattleRoomSession, setTurnBattleRoomSession } = useGameModuleContext();
  const gateway = mode === "TURN" ? services.turnBattleRoomGateway : services.battleRoomGateway;
  const rememberSession = mode === "TURN" ? setTurnBattleRoomSession : setBattleRoomSession;
  if (!gateway || !rememberSession) throw new Error("Room gateway is not configured.");
  const [rooms, setRooms] = useState<readonly BattleRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = useCallback(async (background = false) => {
    if (!background) setRefreshing(true);
    try {
      const result = await gateway.getRooms();
      setRooms(result);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "방 목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
      if (!background) setRefreshing(false);
    }
  }, [gateway]);

  useEffect(() => {
    let active = true;
    const unsubscribe = gateway.subscribeRooms?.(
      (nextRooms) => {
        if (!active) return;
        setRooms(nextRooms);
        setLoading(false);
        setError(null);
      },
      (cause) => {
        if (active) setError(errorMessage(cause, "실시간 방 목록 연결이 끊겼습니다. 자동으로 다시 연결합니다."));
      },
    );
    void gateway.getRooms().then((result) => {
      if (active) { setRooms(result); setError(null); }
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause, "방 목록을 불러오지 못했습니다."));
    }).finally(() => { if (active) setLoading(false); });

    if (unsubscribe) return () => { active = false; unsubscribe(); };
    const timer = window.setInterval(
      () => { if (active) void loadRooms(true); },
      config.battleRoomPollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS,
    );
    return () => { active = false; window.clearInterval(timer); };
  }, [config.battleRoomPollingIntervalMs, loadRooms, gateway]);

  const createRoom = async (request: CreateRoomRequest) => {
    setCreating(true);
    setError(null);
    try {
      const session = await gateway.createRoom(request);
      rememberSession(session);
      setModalOpen(false);
      navigate(session.roomId);
    } catch (cause) {
      setError(errorMessage(cause, "방을 만들지 못했습니다."));
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async (roomCode: string) => {
    setJoiningRoomId(roomCode);
    setError(null);
    try {
      const session = await gateway.joinRoom(roomCode);
      rememberSession(session);
      navigate(session.roomId);
    } catch (cause) {
      setError(errorMessage(cause, "방에 입장하지 못했습니다."));
    } finally {
      setJoiningRoomId(null);
    }
  };

  return (
    <main className={`${styles.page} ${styles.lobbyPage}`}>
      <header className={`${styles.pageHeader} ${styles.lobbyHero}`}>
        <div>
          <span className={styles.eyebrow}>{mode === "TURN" ? "턴 배틀 1:1" : "블록쌓기 1:1"} ·  지문자 대전</span>
          <h1>대전방</h1>
          <p>방을 만들거나 참가 코드로 상대방의 방에 입장하세요.</p>
        </div>
        <div className={styles.headerActions}>
          <Link to={mode === "TURN" ? "/game" : "../block"}><ArrowLeft aria-hidden="true" size={17} />모드 선택</Link>
          {import.meta.env.DEV ? <Link to="practice">봇 연습</Link> : null}
          <button type="button" className={styles.primaryButton} onClick={() => setModalOpen(true)}>
            <Plus aria-hidden="true" size={17} />방 만들기
          </button>
        </div>
      </header>
      <div className={styles.toolbar}>
        <p aria-live="polite">{loading ? "방을 확인하는 중입니다." : `입장 가능한 방 ${rooms.length}개가 있습니다.`}</p>
        <button type="button" onClick={() => void loadRooms()} disabled={refreshing}>
          <RefreshCw aria-hidden="true" size={16} />{refreshing ? "확인 중" : "새로고침"}
        </button>
      </div>
      {error ? <p className={styles.errorBanner} role="alert">{error}</p> : null}
      <section className={`${styles.roomGrid} ${styles.lobbyRoomGrid}`} aria-label="대전방 목록">
        {!loading && rooms.length === 0
          ? <div className={styles.emptyState}>아직 열린 방이 없습니다. 새 방을 만들어 시작하세요.</div>
          : null}
        {rooms.map((room) => (
          <BattleRoomCard
            key={room.roomCode ?? room.roomId}
            room={room}
            joining={joiningRoomId === room.roomId}
            onJoin={(roomCode) => void joinRoom(roomCode)}
          />
        ))}
      </section>
      <CreateRoomModal
        open={modalOpen}
        submitting={creating}
        onClose={() => setModalOpen(false)}
        onSubmit={(request) => void createRoom(request)}
      />
    </main>
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
