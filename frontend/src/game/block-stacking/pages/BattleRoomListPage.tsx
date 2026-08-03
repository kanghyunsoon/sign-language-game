import { ArrowLeft, Gamepad2, RefreshCw, Search, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGameModuleContext } from "../../app/GameModuleContext";
import { createDevAuthHeaders } from "../../app/devAuthHeaders";
import { RankingClient, type RankingResponse } from "../../ranking";
import { BattleRoomCard } from "../battle/components/BattleRoomCard";
import { CreateRoomModal } from "../battle/components/CreateRoomModal";
import { OtterFollower } from "../battle/components/OtterFollower";
import styles from "../battle/components/BattleRoomUi.module.css";
import { isMissingOrForbiddenRoom } from "../battle/core/BattleRoomRecovery";
import type { BattleRoomSession, BattleRoomSummary, CreateRoomRequest } from "../battle/room";
const DEFAULT_POLLING_INTERVAL_MS = 2_500;
const CREATE_ROOM_LOCK_MS = 1_500;
const RANKING_REFRESH_INTERVAL_MS = 30_000;
const BATTLE_LOBBY_CANVAS_WIDTH = 1280;
const BATTLE_LOBBY_CANVAS_HEIGHT = 720;
type RoomFilter = "ALL" | "WAITING" | "OPEN";
export function BattleRoomListPage({ mode = "BLOCK" }: { readonly mode?: "BLOCK" | "TURN" }) {
  const navigate = useNavigate();
  const { user, accessToken, config, services, battleRoomSession, turnBattleRoomSession, setBattleRoomSession, setTurnBattleRoomSession } = useGameModuleContext();
  const gateway = mode === "TURN" ? services.turnBattleRoomGateway : services.battleRoomGateway;
  const rememberSession = mode === "TURN" ? setTurnBattleRoomSession : setBattleRoomSession;
  const activeRoomSession = mode === "TURN" ? turnBattleRoomSession : battleRoomSession;
  if (!gateway || !rememberSession) throw new Error("Room gateway is not configured.");
  const [rooms, setRooms] = useState<readonly BattleRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoomFilter>("ALL");
  const [roomCode, setRoomCode] = useState("");
  const [pageScale, setPageScale] = useState(1);
  const [ranking, setRanking] = useState<RankingResponse | null>(null);
  const [rankingLoading, setRankingLoading] = useState(true);
  const [rankingUnavailable, setRankingUnavailable] = useState(false);
  const rankingClient = useMemo(() => new RankingClient({
    apiBaseUrl: config.roomApiBaseUrl,
    userId: user.userId,
    gameType: mode === "TURN" ? "SIGN_DUEL" : "TETRIS_DUEL",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : createDevAuthHeaders(user),
  }), [accessToken, config.roomApiBaseUrl, mode, user]);
  useEffect(() => {
    const updatePageScale = () => {
      setPageScale(Math.min(
        window.innerWidth / BATTLE_LOBBY_CANVAS_WIDTH,
        window.innerHeight / BATTLE_LOBBY_CANVAS_HEIGHT,
      ));
    };
    updatePageScale();
    window.addEventListener("resize", updatePageScale);
    return () => window.removeEventListener("resize", updatePageScale);
  }, []);
  const loadRooms = useCallback(async (background = false) => { if (!background) setRefreshing(true); try { const result = !background && gateway.refreshRooms ? await gateway.refreshRooms() : await gateway.getRooms(); setRooms(result); setError(null); } catch (cause) { setError(errorMessage(cause, "방 목록을 불러오지 못했습니다.")); } finally { setLoading(false); if (!background) setRefreshing(false); } }, [gateway]);
  useEffect(() => { let active = true; void gateway.getRooms().then((result) => { if (active) { setRooms(result); setError(null); } }).catch((cause: unknown) => { if (active) setError(errorMessage(cause, "방 목록을 불러오지 못했습니다.")); }).finally(() => { if (active) setLoading(false); }); const timer = window.setInterval(() => { if (active) void loadRooms(true); }, config.battleRoomPollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS); return () => { active = false; window.clearInterval(timer); }; }, [config.battleRoomPollingIntervalMs, loadRooms, gateway]);
  useEffect(() => {
    return gateway.subscribeRooms?.(
      (nextRooms) => {
        setRooms(nextRooms);
        setLoading(false);
        setError(null);
      },
      (cause) => {
        setLoading(false);
        setError(errorMessage(cause, "Lobby updates are temporarily unavailable."));
      },
    );
  }, [gateway]);
  useEffect(() => {
    let active = true;
    const loadRanking = async () => {
      try {
        const result = await rankingClient.get({ cache: "no-store" });
        if (!active) return;
        setRanking(result);
        setRankingUnavailable(false);
      } catch {
        if (!active) return;
        setRankingUnavailable(true);
      } finally {
        if (active) setRankingLoading(false);
      }
    };
    const refreshRanking = () => void loadRanking();
    refreshRanking();
    const timer = window.setInterval(refreshRanking, RANKING_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshRanking);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshRanking);
    };
  }, [rankingClient]);
  const displayRooms = rooms;
  const visibleRooms = useMemo(() => displayRooms.filter((room) => { const byName = room.title.toLowerCase().includes(query.trim().toLowerCase()); const byStatus = filter === "ALL" || (filter === "WAITING" ? room.status === "WAITING" : room.canJoin); return byName && byStatus; }), [displayRooms, filter, query]);
  const createRoom = async (request: CreateRoomRequest) => {
    // React state is applied after the current event turn, so rapid submit
    // events can otherwise pass `creating === false` more than once.
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    setError(null);
    const lockedAt = Date.now();
    try {
      if (activeRoomSession && activeRoomSession.status !== "FINISHED") {
        try {
          const authoritativeSession = await gateway.joinRoom(activeRoomSession.roomCode || activeRoomSession.roomId);
          if (authoritativeSession.status !== "FINISHED") {
            rememberSession(authoritativeSession);
            setModalOpen(false);
            setError("이미 참가 중인 방이 있습니다. 기존 방에 재입장하거나 먼저 나가 주세요.");
            creatingRef.current = false;
            setCreating(false);
            return;
          }
        } catch (cause) {
          if (!isMissingOrForbiddenRoom(cause)) throw cause;
        }
        rememberSession(null);
      } else if (activeRoomSession?.status === "FINISHED") {
        rememberSession(null);
      }

      const session = await gateway.createRoom(request);
      rememberSession(session);
      setModalOpen(false);
      navigate(session.roomId);
    } catch (cause) {
      setError(errorMessage(cause, "방을 만들지 못했습니다."));
      const remainingLockMs = Math.max(0, CREATE_ROOM_LOCK_MS - (Date.now() - lockedAt));
      window.setTimeout(() => {
        creatingRef.current = false;
        setCreating(false);
      }, remainingLockMs);
    }
  };
  const joinRoom = async (roomId: string) => {
    setJoiningRoomId(roomId);
    setError(null);
    try {
      const joined = await gateway.joinRoom(roomId);
      const listedRoom = rooms.find((candidate) => candidate.roomId === roomId || candidate.roomCode === roomId);
      const session = listedRoom ? enrichJoinedSession(joined, listedRoom, user.userId) : joined;
      rememberSession(session);
      navigate(session.roomId);
    } catch (cause) {
      if (activeRoomSession?.roomCode === roomId && isMissingOrForbiddenRoom(cause)) rememberSession(null);
      setError(errorMessage(cause, "방에 입장하지 못했습니다."));
    } finally {
      setJoiningRoomId(null);
    }
  };
  const joinByCode = () => { const normalized = roomCode.trim(); if (!normalized || joiningRoomId) return; void joinRoom(normalized); };
  return (
    <main
      className={[styles.page, styles.lobbyPage, styles.fixedCanvasPage].join(" ")}
      data-fixed-battle-lobby-canvas="true"
      style={{ transform: `translate(-50%, -50%) scale(${pageScale})` }}
    >
      <button type="button" className={styles.lobbyBack} onClick={() => navigate(mode === "TURN" ? "/game" : "/game/block")} aria-label="게임 모드 선택으로 돌아가기"><ArrowLeft aria-hidden={true} size={23} /></button>
      <button type="button" className={styles.lobbyProfile}>{user.displayName}</button>

      <header className={styles.lobbyHero}>
        <span>{mode === "TURN" ? "1:1 TURN BATTLE" : "1:1 BLOCK BATTLE"}</span>
        <h1>게임방 찾기</h1>
        <p>같은 규칙으로 경쟁할 상대와 게임방을 찾아보세요.</p>
      </header>

      {error ? <p className={styles.errorBanner} role="alert">{error}</p> : null}

      <div className={styles.lobbyGrid}>
        <aside className={styles.rankingPanel} aria-label="실시간 랭킹">
          <header><span><Trophy aria-hidden="true" size={18} /> 실시간 랭킹</span><small>TOP 5</small></header>
          <div className={styles.rankingScope}>1:1 전체 기록</div>
          <ol>
            {rankingLoading ? <li className={styles.rankingState}>랭킹을 불러오는 중...</li> : null}
            {!rankingLoading && rankingUnavailable ? <li className={styles.rankingState}>랭킹을 불러올 수 없어요.</li> : null}
            {!rankingLoading && !rankingUnavailable && ranking?.top.length === 0 ? <li className={styles.rankingState}>아직 등록된 대전 기록이 없어요.</li> : null}
            {!rankingLoading && !rankingUnavailable ? ranking?.top.slice(0, 5).map((entry) => (
              <li key={entry.userId} className={entry.userId === ranking.me?.userId ? styles.myRank : undefined}>
                <b>{entry.rank}</b>
                <span><strong>{entry.nickname}</strong><small>{mode === "TURN" ? "1:1 수어 대전" : "1:1 블록 대전"}</small></span>
                <em>{entry.score.toLocaleString()}승</em>
              </li>
            )) : null}
          </ol>
          <section className={styles.rankTip}>
            <strong>{ranking?.me ? `내 순위 ${ranking.me.rank}위` : "내 순위"}</strong>
            <p>{ranking?.me ? `${ranking.me.nickname} · ${ranking.me.score.toLocaleString()}승` : rankingUnavailable ? "랭킹 연결을 확인해 주세요." : "아직 집계된 1:1 대전 기록이 없어요."}</p>
          </section>
        </aside>

        <section className={styles.lobbyRooms} aria-label="프링글수 게임방">
          <header className={styles.roomsTitle}><span><Gamepad2 aria-hidden="true" size={20} /> {mode === "TURN" ? "수달 턴 대전 방" : "프링글수 게임방"}</span><small>{loading ? "..." : String(rooms.length) + "개"}</small></header>
          <div className={styles.roomSearch}>
            <label><Search aria-hidden="true" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="방 이름을 검색하세요." aria-label="방 이름 검색" /></label>
            <div>{([['ALL','전체'], ['WAITING','대기 중'], ['OPEN','입장 가능']] as const).map(([value,label]) => <button key={value} type="button" className={filter === value ? styles.active : undefined} onClick={() => setFilter(value)}>{label}</button>)}</div>
            <button type="button" className={styles.refreshButton} onClick={() => void loadRooms()} disabled={refreshing}><RefreshCw aria-hidden="true" size={15} />{refreshing ? "불러오는 중" : "새로고침"}</button>
          </div>
          <div className={styles.roomGrid}>
            {!loading && visibleRooms.length === 0 ? (
              <div className={styles.emptyState}>
                <Gamepad2 className={styles.emptyStateIcon} aria-hidden="true" size={30} />
                <strong>{rooms.length === 0 ? "아직 열린 방이 없어요" : "조건에 맞는 방이 없어요"}</strong>
                <p>{rooms.length === 0 ? "첫 게임방을 만들고 새로운 대결을 시작해 보세요." : "검색어나 필터를 바꾸면 다른 방을 찾을 수 있어요."}</p>
              </div>
            ) : null}
            {visibleRooms.map((room) => <BattleRoomCard key={room.roomId} room={room} joining={joiningRoomId === room.roomId} currentRoom={Boolean(activeRoomSession?.roomCode && activeRoomSession.roomCode === room.roomCode)} onJoin={(id) => void joinRoom(id)} />)}
          </div>
        </section>

        <aside className={styles.lobbySide}>
          <section className={styles.createPanel}>
            <div className={styles.lobbyPrimaryActions}>
              <button type="button" className={styles.createButton} onClick={() => setModalOpen(true)}>방 만들기</button>
              <button type="button" className={styles.quickJoinButton} onClick={() => { const room = rooms.find((item) => item.canJoin); if (room) void joinRoom(room.roomId); }}>빠른 입장</button>
            </div>
          </section>
          <OtterFollower />
          <section className={styles.quickTip}>
            <strong>초대 코드로 입장</strong>
            <div className={styles.codeJoin}><div><input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="ABCD12" aria-label="초대 코드" /><button type="button" onClick={joinByCode} disabled={!roomCode.trim() || joiningRoomId !== null}>{"\uCF54\uB4DC \uC785\uC7A5"}</button></div></div>
          </section>
          <section className={styles.modeTip}><strong>{mode === "TURN" ? "수달 턴 대전" : "프링글수"}</strong><p>화면에 나타나는 지문자를 표현해 블록을 제거하는 1대1 게임이에요.</p></section>
        </aside>
      </div>

      <CreateRoomModal open={modalOpen} submitting={creating} onClose={() => setModalOpen(false)} onSubmit={(request) => void createRoom(request)} />
    </main>
  );
}
function errorMessage(cause: unknown, fallback: string): string { return cause instanceof Error && cause.message ? cause.message : fallback; }
function enrichJoinedSession(session: BattleRoomSession, listedRoom: BattleRoomSummary, currentUserId: string): BattleRoomSession {
  return {
    ...session,
    title: listedRoom.title,
    hostName: listedRoom.hostName,
    symbolRange: listedRoom.symbolRange,
    participants: session.participants.map((participant) => participant.isHost && participant.userId !== currentUserId
      ? { ...participant, displayName: listedRoom.hostName }
      : participant),
  };
}
