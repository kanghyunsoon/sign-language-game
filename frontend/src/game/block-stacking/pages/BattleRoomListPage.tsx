import { ArrowLeft, Plus, RefreshCw, Search, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGameModuleContext } from "../../app/GameModuleContext";
import { BattleRoomCard } from "../battle/components/BattleRoomCard";
import { CreateRoomModal } from "../battle/components/CreateRoomModal";
import styles from "../battle/components/BattleRoomUi.module.css";
import type { BattleRoomSummary, CreateRoomRequest } from "../battle/room";
const DEFAULT_POLLING_INTERVAL_MS = 2_500;
const RANKING = ["수달왕", "손톡이", "지문자고수", "새콩이", "수어초보"] as const;
type RoomFilter = "ALL" | "WAITING" | "OPEN";
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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RoomFilter>("ALL");
  const [roomCode, setRoomCode] = useState("");
  const loadRooms = useCallback(async (background = false) => { if (!background) setRefreshing(true); try { const result = await gateway.getRooms(); setRooms(result); setError(null); } catch (cause) { setError(errorMessage(cause, "방 목록을 불러오지 못했습니다.")); } finally { setLoading(false); if (!background) setRefreshing(false); } }, [gateway]);
  useEffect(() => { let active = true; void gateway.getRooms().then((result) => { if (active) { setRooms(result); setError(null); } }).catch((cause: unknown) => { if (active) setError(errorMessage(cause, "방 목록을 불러오지 못했습니다.")); }).finally(() => { if (active) setLoading(false); }); const timer = window.setInterval(() => { if (active) void loadRooms(true); }, config.battleRoomPollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS); return () => { active = false; window.clearInterval(timer); }; }, [config.battleRoomPollingIntervalMs, loadRooms, gateway]);
  const visibleRooms = useMemo(() => rooms.filter((room) => { const byName = room.title.toLowerCase().includes(query.trim().toLowerCase()); const byStatus = filter === "ALL" || (filter === "WAITING" ? room.status === "WAITING" : room.canJoin); return byName && byStatus; }), [filter, query, rooms]);
  const createRoom = async (request: CreateRoomRequest) => { setCreating(true); setError(null); try { const session = await gateway.createRoom(request); rememberSession(session); setModalOpen(false); navigate(session.roomId); } catch (cause) { setError(errorMessage(cause, "방을 만들지 못했습니다.")); } finally { setCreating(false); } };
  const joinRoom = async (roomId: string) => { setJoiningRoomId(roomId); setError(null); try { const session = await gateway.joinRoom(roomId); rememberSession(session); navigate(session.roomId); } catch (cause) { setError(errorMessage(cause, "방에 입장하지 못했습니다.")); } finally { setJoiningRoomId(null); } };
  const joinByCode = () => { const normalized = roomCode.trim(); if (!normalized || joiningRoomId) return; void joinRoom(normalized); };
  return <main className={[styles.page, styles.lobbyPage].join(" ")}>
    <Link className={styles.lobbyBack} to={mode === "TURN" ? "/game" : "../block"} aria-label="모드 선택으로 돌아가기"><ArrowLeft aria-hidden="true" size={19} /></Link>
    <button type="button" className={styles.lobbyProfile}>개발 사용자</button>
    <header className={styles.lobbyHero}><span>{mode === "TURN" ? "1:1 TURN BATTLE" : "1:1 BLOCK BATTLE"}</span><h1>게임방 찾기</h1><p>참여할 게임을 선택하고, 입장 가능한 방을 찾아보세요.</p></header>
    {error ? <p className={styles.errorBanner} role="alert">{error}</p> : null}
    <div className={styles.lobbyGrid}>
      <aside className={styles.rankingPanel} aria-label="실시간 랭킹"><header><span><Trophy aria-hidden="true" size={16} /> 실시간 랭킹</span><small>TOP 5</small></header><div className={styles.rankingTabs}><button type="button" className={styles.active}>전체</button><button type="button">주간</button><button type="button">친구</button></div><ol>{RANKING.map((name, index) => <li key={name} className={index === 3 ? styles.myRank : undefined}><b>{index + 1}</b><span><strong>{name}</strong><small>{18 - index * 2}승 {3 + index}패</small></span><em>{(1842 - index * 106).toLocaleString()}</em></li>)}</ol><section className={styles.rankTip}><strong>내 순위</strong><p>현재 상위 5명과의 점수 차이를 확인해 보세요.</p></section></aside>
      <section className={styles.lobbyRooms} aria-label="지문자 테트리스 방"><header className={styles.roomsTitle}><span>🎮 {mode === "TURN" ? "수달 턴 대전 방" : "지문자 테트리스 방"}</span><small>{loading ? "..." : String(rooms.length) + "개"}</small></header><div className={styles.roomSearch}><label><Search aria-hidden="true" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="방 이름을 검색하세요." aria-label="방 이름 검색" /></label><div>{([['ALL','전체'], ['WAITING','대기 중'], ['OPEN','입장 가능']] as const).map(([value,label]) => <button key={value} type="button" className={filter === value ? styles.active : undefined} onClick={() => setFilter(value)}>{label}</button>)}</div><button type="button" className={styles.refreshButton} onClick={() => void loadRooms()} disabled={refreshing}><RefreshCw aria-hidden="true" size={15} />{refreshing ? "불러오는 중" : "새로고침"}</button></div><div className={styles.roomGrid}>{!loading && visibleRooms.length === 0 ? <div className={styles.emptyState}>{rooms.length === 0 ? "아직 열린 방이 없습니다. 새 방을 만들어 시작하세요." : "조건에 맞는 방이 없습니다."}</div> : null}{visibleRooms.map((room) => <BattleRoomCard key={room.roomId} room={room} joining={joiningRoomId === room.roomId} onJoin={(id) => void joinRoom(id)} />)}</div></section>
      <aside className={styles.lobbySide}><section className={styles.createPanel}><header><span><Plus aria-hidden="true" size={17} /> 게임 시작</span></header><button type="button" className={styles.createButton} onClick={() => setModalOpen(true)}>방 만들기</button><p>또는</p><div className={styles.codeJoin}><strong>초대 코드로 입장</strong><div><input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="ABCD12" aria-label="초대 코드" /><button type="button" onClick={joinByCode} disabled={!roomCode.trim() || joiningRoomId !== null}>입장</button></div></div><button type="button" className={styles.linkJoin} onClick={() => setModalOpen(true)}>초대 링크로 입장</button></section><section className={styles.quickTip}><strong>빠른 입장</strong><p>현재 선택한 게임에서 바로 입장 가능한 공개방을 자동으로 찾아드려요.</p><button type="button" onClick={() => { const room = rooms.find((item) => item.canJoin); if (room) void joinRoom(room.roomId); }}>입장 가능한 방 찾기</button></section><section className={styles.modeTip}><strong>{mode === "TURN" ? "수달 턴 대전" : "지문자 테트리스"}</strong><p>화면에 나타나는 지문자를 표현해 블록을 제거하는 1대1 게임이에요.</p></section></aside>
    </div>
    <CreateRoomModal open={modalOpen} submitting={creating} onClose={() => setModalOpen(false)} onSubmit={(request) => void createRoom(request)} />
  </main>;
}
function errorMessage(cause: unknown, fallback: string): string { return cause instanceof Error && cause.message ? cause.message : fallback; }
