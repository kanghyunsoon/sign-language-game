import { ArrowLeft, Camera, CameraOff, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import { ParticipantList } from "../battle/components/ParticipantList";
import styles from "../battle/components/BattleRoomUi.module.css";
import type { BattleRoomDetail } from "../battle/room";
import { GameVideoTile } from "../../media/components/GameVideoTile";
import type { MediaConnectionState, RemoteGameParticipant } from "../../media/core/mediaTypes";
import { HandCamera, PythonWebSocketSignRecognizer, useGameRecognitionSession } from "../../recognition";

const DEFAULT_POLLING_INTERVAL_MS = 2_500;

export function BattleWaitingRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, config, services, battleMediaSession, sharedCameraSession, activePlayerSession, battleRoomSession, setBattleRoomSession } = useGameModuleContext();
  const recognizer=useMemo(()=>new PythonWebSocketSignRecognizer({url:config.aiWebSocketUrl}),[config.aiWebSocketUrl]);
  const recognitionSession=useGameRecognitionSession(recognizer,sharedCameraSession,activePlayerSession);
  const [room, setRoom] = useState<BattleRoomDetail | null>(() => battleRoomSession?.roomId === roomId ? battleRoomSession : null);
  const [localStream, setLocalStream] = useState(() => sharedCameraSession.getStream());
  const [remoteParticipants, setRemoteParticipants] = useState<readonly RemoteGameParticipant[]>(() => battleMediaSession.getRemoteParticipants());
  const [rtcState, setRtcState] = useState<MediaConnectionState>(() => battleMediaSession.getConnectionState());
  const [cameraEnabled, setCameraEnabled] = useState(() => battleMediaSession.isCameraEnabled());
  const [connecting, setConnecting] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMedia = useCallback(() => {
    setLocalStream(sharedCameraSession.getStream());
    setRemoteParticipants(battleMediaSession.getRemoteParticipants());
    setRtcState(battleMediaSession.getConnectionState());
    setCameraEnabled(battleMediaSession.isCameraEnabled());
  }, [battleMediaSession, sharedCameraSession]);

  const loadRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const detail = await services.battleRoomGateway.getRoom(roomId);
      setRoom(detail);
      setBattleRoomSession({ ...detail, currentUser: user });
      await battleMediaSession.syncParticipants(detail);
      if (detail.activeMatchId) {
        navigate(`/game/battle/${roomId}/play`, { replace: true });
        return;
      }
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "대기방 정보를 불러오지 못했습니다."));
    }
  }, [battleMediaSession, navigate, roomId, services.battleRoomGateway, setBattleRoomSession, user]);

  useEffect(() => battleMediaSession.subscribe(refreshMedia), [battleMediaSession, refreshMedia]);
  useEffect(() => {
    void loadRoom();
    const timer = window.setInterval(() => void loadRoom(), config.battleRoomPollingIntervalMs ?? DEFAULT_POLLING_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [config.battleRoomPollingIntervalMs, loadRoom]);

  const connectMedia = async () => {
    if (!roomId || !room || connecting || rtcState === "CONNECTED") return;
    setConnecting(true);
    setError(null);
    try {
      const stream = await sharedCameraSession.start();
      setLocalStream(stream);
      await battleMediaSession.connect(room, stream);
      refreshMedia();
    } catch (cause) {
      setError(errorMessage(cause, "상대 영상 연결을 시작하지 못했습니다. 게임은 영상 없이도 시작할 수 있습니다."));
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    if (room && rtcState === "DISCONNECTED" && !connecting) void connectMedia();
  // Room identity is the automatic-connect boundary; media state updates are handled by its subscription.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.roomId]);

  const toggleCamera = async () => {
    try {
      await battleMediaSession.setCameraEnabled(!cameraEnabled);
      refreshMedia();
    } catch (cause) {
      setError(errorMessage(cause, "카메라 상태를 변경하지 못했습니다."));
    }
  };

  const leaveRoom = async () => {
    if (!roomId || leaving) return;
    setLeaving(true);
    try {
      await services.battleRoomGateway.leaveRoom(roomId);
      await battleMediaSession.disconnect();
      sharedCameraSession.stop();
      activePlayerSession?.clearRegistration();
      setBattleRoomSession(null);
      navigate("/game/battle", { replace: true });
    } catch (cause) {
      setError(errorMessage(cause, "방을 나가지 못했습니다."));
      setLeaving(false);
    }
  };

  const startGame = async () => {
    if (!roomId || !room?.canStart || startingGame) return;
    setStartingGame(true);
    setError(null);
    try {
      await services.battleRoomGateway.startGame(roomId);
      const startedRoom = await services.battleRoomGateway.getRoom(roomId);
      setBattleRoomSession({ ...startedRoom, currentUser: user });
      navigate("play");
    } catch (cause) {
      setError(errorMessage(cause, "서버가 게임 시작을 거절했습니다."));
      setStartingGame(false);
    }
  };

  const isHost = room?.hostUserId === user.userId;
  const opponentName = useMemo(() => room?.participants.find((participant) => participant.userId !== user.userId)?.displayName ?? "상대 영상", [room, user.userId]);
  const remote = remoteParticipants[0] ?? null;
  const peerState = remote?.connectionState ?? (room?.participants.length === 2 ? rtcState : "DISCONNECTED");
  const botOpponent = /bot|mock|연습/i.test(opponentName);

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div><span className={styles.eyebrow}>1:1 대전 대기실</span><h1>{room?.title ?? "대기방 불러오는 중"}</h1><p>{isHost ? "방장" : "참가자"} · {room?.difficulty ?? "-"} · {room?.symbolRange.join(" ") ?? "-"}</p></div>
        <div className={styles.headerActions}><button type="button" onClick={() => void loadRoom()}><RefreshCw aria-hidden="true" size={16} />새로고침</button><button type="button" onClick={() => void leaveRoom()} disabled={leaving}><ArrowLeft aria-hidden="true" size={16} />{leaving ? "나가는 중" : "방 나가기"}</button></div>
      </header>
      {error ? <p className={styles.errorBanner} role="alert">{error}</p> : null}
      <div className={styles.connectionStrip} aria-live="polite">
        <span>카메라<strong>{localStream ? (cameraEnabled ? "켜짐" : "꺼짐") : "준비 중"}</strong></span><span>AI 서버<strong>게임 시작 전 대기</strong></span><span>Game WebSocket<strong>게임 시작 시 연결</strong></span><span>RTC Signaling<strong>{connectionLabel(rtcState)}</strong></span><span>상대 연결<strong>{connectionLabel(peerState)}</strong></span>
      </div>
      <div className={styles.waitingLayout}>
        <aside className={styles.waitingSidebar}>
          {room ? <ParticipantList participants={room.participants} currentUserId={user.userId} maxPlayers={room.maxPlayers} /> : <div className={styles.emptyState}>참가자 정보를 불러오는 중입니다.</div>}
          <section className={styles.infoPanel}><h2>게임 설정</h2><dl className={styles.roomFacts}><div><dt>내 역할</dt><dd>{isHost ? "방장" : "참가자"}</dd></div><div><dt>상대방</dt><dd>{room?.participants.find((participant) => participant.userId !== user.userId)?.displayName ?? "대기 중"}</dd></div><div><dt>난이도</dt><dd>{room?.difficulty ?? "-"}</dd></div><div><dt>출제 범위</dt><dd>{room?.symbolRange.join(" · ") ?? "-"}</dd></div></dl></section>
        </aside>
        <section className={styles.videoArea} aria-label="대전 영상 미리보기">
          <div className={styles.videoPair}>
            {localStream?<HandCamera sharedStream={localStream} autoStart activePlayerSession={activePlayerSession} recognitionSession={recognitionSession} performanceMonitor={recognizer.getPerformanceMonitor()} temporalDecoder={recognizer.getTemporalDecoder()} connectionState={recognizer.getConnectionState()}/>:<GameVideoTile kind="LOCAL" label="내 영상" stream={null} cameraEnabled={false} connectionState="DISCONNECTED" />}
            <GameVideoTile kind="REMOTE" label={botOpponent && !remote ? "연습 상대 · 카메라 없음" : remote?.displayName ?? opponentName} stream={remote?.stream ?? null} cameraEnabled={remote?.cameraEnabled ?? false} connectionState={peerState} />
          </div>
          <div className={styles.waitingActions}>
            <button type="button" onClick={() => void connectMedia()} disabled={connecting || rtcState === "CONNECTED"}><Camera aria-hidden="true" size={17} />{connecting ? "영상 연결 준비 중" : rtcState === "FAILED" ? "영상 다시 연결" : "상대 영상 연결"}</button>
            <button type="button" onClick={() => void toggleCamera()} disabled={!localStream}>{cameraEnabled ? <CameraOff aria-hidden="true" size={17} /> : <Camera aria-hidden="true" size={17} />}{cameraEnabled ? "카메라 끄기" : "카메라 켜기"}</button>
            {isHost ? <button type="button" className={styles.primaryButton} disabled={!room?.canStart || startingGame} onClick={() => void startGame()}><Play aria-hidden="true" size={17} />{startingGame ? "서버 확인 중" : "게임 시작"}</button> : null}
          </div>
          {isHost && !room?.canStart ? <p className={styles.startReason}>{room?.startBlockReason ?? "방 정보를 확인하는 중입니다."}</p> : <p className={styles.startReason}>{isHost ? "서버가 시작 조건을 최종 확인합니다." : "방장이 게임을 시작할 때까지 기다려 주세요."}</p>}
        </section>
      </div>
    </main>
  );
}

function connectionLabel(state: MediaConnectionState): string {
  switch (state) { case "CONNECTING": return "상대와 연결 중"; case "CONNECTED": return "영상 연결됨"; case "RECONNECTING": return "영상 재연결 중"; case "FAILED": return "영상 연결 실패"; case "DISCONNECTED": return "영상 연결 준비 중"; }
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
