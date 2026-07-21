import { ArrowLeft, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import { BattleRoomCard } from "../battle/components/BattleRoomCard";
import { CreateRoomModal } from "../battle/components/CreateRoomModal";
import styles from "../battle/components/BattleRoomUi.module.css";
import type { BattleRoomSummary, CreateRoomRequest } from "../battle/room";

const DEFAULT_POLLING_INTERVAL_MS = 2_500;

export function BattleRoomListPage() {
  const navigate = useNavigate();
  const { config, services, setBattleRoomSession } = useGameModuleContext();
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
      const result = await services.battleRoomGateway.getRooms();
      setRooms(result);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "방 목록을 불러오지 못했습니다."));
    } finally {
      setLoading(false);
      if (!background) setRefreshing(false);
    }
  }, [services.battleRoomGateway]);

  useEffect(() => {
    let active = true;
    void services.battleRoomGateway.getRooms().then((result) => {
      if (active) { setRooms(result); setError(null); }
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause, "방 목록을 불러오지 못했습니다."));
    }).finally(() => { if (active) setLoading(false); });
    const timer = window.setInterval(() => { if (active) void loadRooms(true); }, config.battleRoomPollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [config.battleRoomPollingIntervalMs, loadRooms, services.battleRoomGateway]);

  const createRoom = async (request: CreateRoomRequest) => {
    setCreating(true);
    setError(null);
    try {
      const session = await services.battleRoomGateway.createRoom(request);
      setBattleRoomSession(session);
      setModalOpen(false);
      navigate(session.roomId);
    } catch (cause) {
      setError(errorMessage(cause, "방을 만들지 못했습니다."));
    } finally {
      setCreating(false);
    }
  };

  const joinRoom = async (roomId: string) => {
    setJoiningRoomId(roomId);
    setError(null);
    try {
      const session = await services.battleRoomGateway.joinRoom(roomId);
      setBattleRoomSession(session);
      navigate(session.roomId);
    } catch (cause) {
      setError(errorMessage(cause, "방에 입장하지 못했습니다."));
    } finally {
      setJoiningRoomId(null);
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div><span className={styles.eyebrow}>1:1 지문자 대전</span><h1>대전방</h1><p>연습할 범위와 난이도를 확인하고 입장하세요.</p></div>
        <div className={styles.headerActions}><Link to="../block"><ArrowLeft aria-hidden="true" size={17} />모드 선택</Link>{import.meta.env.DEV?<Link to="practice">봇 연습</Link>:null}<button type="button" className={styles.primaryButton} onClick={() => setModalOpen(true)}><Plus aria-hidden="true" size={17} />방 만들기</button></div>
      </header>
      <div className={styles.toolbar}><p aria-live="polite">{loading ? "방을 확인하는 중입니다." : `입장 가능한 방을 포함해 ${rooms.length}개가 있습니다.`}</p><button type="button" onClick={() => void loadRooms()} disabled={refreshing}><RefreshCw aria-hidden="true" size={16} />{refreshing ? "새로고침 중" : "새로고침"}</button></div>
      {error ? <p className={styles.errorBanner} role="alert">{error}</p> : null}
      <section className={styles.roomGrid} aria-label="대전방 목록">
        {!loading && rooms.length === 0 ? <div className={styles.emptyState}>아직 열린 방이 없습니다. 새 방을 만들어 시작하세요.</div> : null}
        {rooms.map((room) => <BattleRoomCard key={room.roomId} room={room} joining={joiningRoomId === room.roomId} onJoin={(id) => void joinRoom(id)} />)}
      </section>
      <CreateRoomModal open={modalOpen} submitting={creating} onClose={() => setModalOpen(false)} onSubmit={(request) => void createRoom(request)} />
    </main>
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
