import { ArrowLeft, Camera, CameraOff, Check, Play } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import { ParticipantList } from "../battle/components/ParticipantList";
import styles from "../battle/components/BattleRoomUi.module.css";
import type { BattleRoomDetail } from "../battle/room";
import { GameVideoTile } from "../../media/components/GameVideoTile";
import { HandCamera, PythonWebSocketSignRecognizer, useGameRecognitionSession } from "../../recognition";
import type { RoomRealtimeSocket } from "../../realtime";

export function BattleWaitingRoomPage({ mode = "BLOCK" }: { readonly mode?: "BLOCK" | "TURN" }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const {
    user,
    config,
    services,
    battleMediaSession,
    sharedCameraSession,
    activePlayerSession,
    battleRoomSession,
    setBattleRoomSession,
    turnBattleRoomSession,
    setTurnBattleRoomSession,
  } = useGameModuleContext();
  const gateway = mode === "TURN" ? services.turnBattleRoomGateway : services.battleRoomGateway;
  const roomSession = mode === "TURN" ? turnBattleRoomSession : battleRoomSession;
  const rememberSession = mode === "TURN" ? setTurnBattleRoomSession : setBattleRoomSession;
  const lobbyPath = mode === "TURN" ? "/game/turn-battle" : "/game/battle";
  if (!gateway || !rememberSession) throw new Error("Room gateway is not configured.");
  const recognizer = useMemo(
    () => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl }),
    [config.aiWebSocketUrl],
  );
  const recognitionSession = useGameRecognitionSession(
    recognizer,
    sharedCameraSession,
    activePlayerSession,
  );
  const [room, setRoom] = useState<BattleRoomDetail | null>(
    () => roomSession?.roomId === roomId ? (roomSession ?? null) : null,
  );
  const [localStream, setLocalStream] = useState(() => sharedCameraSession.getStream());
  const [cameraEnabled, setCameraEnabled] = useState(
    () => sharedCameraSession.getVideoTrack()?.enabled ?? false,
  );
  const [realtimeState, setRealtimeState] = useState<"CONNECTING" | "CONNECTED" | "ERROR">("CONNECTING");
  const [readyBusy, setReadyBusy] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const roomSocketRef = useRef<RoomRealtimeSocket | null>(null);
  const roomRef = useRef<BattleRoomDetail | null>(room);
  const enteringGameRef = useRef(false);
  const startRtcAndEnterRef = useRef<() => Promise<void>>(async () => undefined);

  const rememberRoom = useCallback((next: BattleRoomDetail) => {
    roomRef.current = next;
    setRoom(next);
    rememberSession({ ...next, currentUser: user });
  }, [rememberSession, user]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const startRtcAndEnter = useCallback(async () => {
    if (!roomId || !room || enteringGameRef.current) return;
    enteringGameRef.current = true;
    setStartingGame(true);
    setError(null);
    roomSocketRef.current?.disconnect();
    try {
      const stream = await sharedCameraSession.start();
      setLocalStream(stream);
      setCameraEnabled(sharedCameraSession.getVideoTrack()?.enabled ?? true);
      await battleMediaSession.connect(room, stream);
      navigate(`${lobbyPath}/${roomId}/play`, { replace: true });
    } catch (cause) {
      enteringGameRef.current = false;
      setStartingGame(false);
      setError(errorMessage(cause, "WebRTC 연결을 시작하지 못했습니다."));
    }
  }, [battleMediaSession, navigate, room, roomId, sharedCameraSession]);

  useEffect(() => {
    startRtcAndEnterRef.current = startRtcAndEnter;
  }, [startRtcAndEnter]);

  useEffect(() => {
    if (!roomId || room || !roomSession) return;
    if (roomSession.roomId === roomId) rememberRoom(roomSession);
  }, [roomSession, rememberRoom, room, roomId]);

  useEffect(() => {
    if (!roomId || !gateway.subscribeRooms) return;
    return gateway.subscribeRooms((rooms) => {
      const current = roomRef.current;
      if (!current) return;
      const summary = rooms.find((candidate) => candidate.roomId === current.roomId || candidate.roomCode === current.roomCode);
      if (!summary) return;
      if (summary.status === "PLAYING") {
        void startRtcAndEnterRef.current();
        return;
      }

      const playerCount = Math.min(summary.playerCount, current.maxPlayers);
      if (playerCount === current.playerCount && summary.status === current.status) return;

      const guest = current.participants.find((participant) => !participant.isHost);
      const participants = playerCount > 1
        ? [
          ...current.participants.filter((participant) => participant.isHost),
          guest ?? { userId: "pending-guest", displayName: "\uC0C1\uB300\uBC29", isHost: false, ready: current.guestReady ?? false },
        ]
        : current.participants.filter((participant) => participant.isHost);

      rememberRoom({
        ...current,
        status: summary.status,
        playerCount,
        canJoin: summary.canJoin,
        participants,
      });
    }, (cause) => setError(errorMessage(cause, "?湲곗떎 ?ㅼ떆媛??곹깭瑜?媛깆떊?섏? 紐삵뻽?듬땲??")));
  }, [gateway, roomId, rememberRoom]);
  useEffect(() => {
    if (!roomId || !services.roomRealtimeSocketFactory) return;
    const socket = services.roomRealtimeSocketFactory.create(roomId);
    roomSocketRef.current = socket;
    const unsubscribe = socket.subscribe((message) => {
      if (message.type === "GAME_STARTED") void startRtcAndEnter();
      if (message.type === "PEER_LEFT") {
        const current = roomRef.current;
        if (current) {
          rememberRoom({
            ...current,
            status: "WAITING",
            playerCount: 1,
            canJoin: true,
            guestReady: false,
            participants: current.participants.filter((participant) => participant.isHost),
          });
        }
        setError("?곷?諛⑹씠 諛⑹쓣 ?섍컮?듬땲??");
      }
      if (message.type === "ERROR") setError("방 실시간 연결에서 오류가 발생했습니다.");
    });
    const unsubscribeError = socket.subscribeError(() => setRealtimeState("ERROR"));
    setRealtimeState("CONNECTING");
    void socket.connect()
      .then(() => setRealtimeState("CONNECTED"))
      .catch((cause) => {
        setRealtimeState("ERROR");
        setError(errorMessage(cause, "방 실시간 연결에 실패했습니다."));
      });
    return () => {
      unsubscribe();
      unsubscribeError();
      if (roomSocketRef.current === socket) roomSocketRef.current = null;
      socket.disconnect();
    };
  }, [roomId, services.roomRealtimeSocketFactory, startRtcAndEnter, rememberRoom]);

  const startCameraPreview = async () => {
    try {
      const stream = await sharedCameraSession.start();
      setLocalStream(stream);
      setCameraEnabled(sharedCameraSession.getVideoTrack()?.enabled ?? true);
    } catch (cause) {
      setError(errorMessage(cause, "카메라를 시작하지 못했습니다."));
    }
  };

  const toggleCamera = () => {
    const track = sharedCameraSession.getVideoTrack();
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraEnabled(track.enabled);
  };

  const toggleReady = async () => {
    if (!roomId || !room || !gateway.setReady || readyBusy) return;
    setReadyBusy(true);
    setError(null);
    try {
      const next = await gateway.setReady(roomId, !room.currentUserReady);
      rememberRoom(next);
    } catch (cause) {
      setError(errorMessage(cause, "준비 상태를 변경하지 못했습니다."));
    } finally {
      setReadyBusy(false);
    }
  };

  useEffect(() => {
    if (!roomId || !room?.hostReady || room.guestReady || room.playerCount < room.maxPlayers || room.hostUserId !== user.userId || !gateway.setReady) return;
    let active = true;
    const syncReadyState = async () => {
      try {
        const next = await gateway.setReady!(roomId, true);
        if (active) rememberRoom(next);
      } catch {
        // The next interval retries. The start button remains safely disabled.
      }
    };
    const timer = window.setInterval(() => void syncReadyState(), 1_000);
    void syncReadyState();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [gateway, rememberRoom, room?.guestReady, room?.hostReady, room?.hostUserId, room?.maxPlayers, room?.playerCount, roomId, user.userId]);
  const startGame = async () => {
    if (!roomId || !room || startingGame || !room.hostReady || !room.guestReady || room.playerCount < room.maxPlayers) return;
    setStartingGame(true);
    setError(null);
    try {
      await gateway.startGame(roomId);
      // The backend also broadcasts GAME_STARTED. Calling this here covers the host
      // immediately; the ref prevents the broadcast from starting a second session.
      await startRtcAndEnter();
    } catch (cause) {
      setStartingGame(false);
      setError(errorMessage(cause, "두 참가자가 모두 준비됐는지 확인해 주세요."));
    }
  };

  const leaveRoom = async () => {
    if (!roomId || leaving) return;
    setLeaving(true);
    try {
      roomSocketRef.current?.disconnect();
      await gateway.leaveRoom(roomId);
      await battleMediaSession.disconnect();
      sharedCameraSession.stop();
      activePlayerSession?.clearRegistration();
      rememberSession(null);
      navigate(lobbyPath, { replace: true });
    } catch (cause) {
      setError(errorMessage(cause, "방을 나가지 못했습니다."));
      setLeaving(false);
    }
  };

  const isHost = room?.hostUserId === user.userId;
  const full = room ? room.playerCount >= room.maxPlayers : false;
  const canRequestStart = Boolean(isHost && full && room?.hostReady && room?.guestReady);

  return (
    <main className={[styles.page, styles.waitingLobby].join(" ")}>
      <header className={[styles.pageHeader, styles.waitingRoomHero].join(" ")}>
        <div>
          <span className={styles.eyebrow}>1:1 지문자 대전 대기실</span>
          <h1>{room?.title ?? "대기실 불러오는 중"}</h1>
          <p>참가 코드 {room?.roomCode ?? "-"} · {isHost ? "방장" : "참가자"}</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={() => void leaveRoom()} disabled={leaving}>
            <ArrowLeft aria-hidden="true" size={16} />{leaving ? "나가는 중" : "방 나가기"}
          </button>
        </div>
      </header>
      {error ? <p className={styles.errorBanner} role="alert">{error}</p> : null}
      <div className={styles.connectionStrip} aria-live="polite">
        <span>Room WebSocket<strong>{realtimeState}</strong></span>
        <span>게임 데이터<strong>시작 후 WebRTC로 전환</strong></span>
        <span>연결 유예<strong>10초</strong></span>
      </div>
      <div className={styles.waitingLayout}>
        <aside className={[styles.waitingSidebar, styles.waitingSettings].join(" ")}>
          {room
            ? <ParticipantList participants={room.participants} currentUserId={user.userId} maxPlayers={room.maxPlayers} />
            : <div className={styles.emptyState}>방 정보를 확인하는 중입니다.</div>}
          <section className={styles.infoPanel}>
            <h2>준비 상태</h2>
            <dl className={styles.roomFacts}>
              <div><dt>방장</dt><dd>{room?.hostReady ? "준비 완료" : "준비 중"}</dd></div>
              <div><dt>참가자</dt><dd>{room?.guestReady ? "준비 완료" : "준비 중"}</dd></div>
              <div><dt>인원</dt><dd>{room ? `${room.playerCount}/${room.maxPlayers}` : "-"}</dd></div>
            </dl>
          </section>
        </aside>
        <section className={[styles.videoArea, styles.waitingStage].join(" ")} aria-label="내 카메라 미리보기">
          <div className={styles.videoPair}>
            {localStream
              ? (
                <HandCamera
                  sharedStream={localStream}
                  autoStart
                  activePlayerSession={activePlayerSession}
                  recognitionSession={recognitionSession}
                  performanceMonitor={recognizer.getPerformanceMonitor()}
                  temporalDecoder={recognizer.getTemporalDecoder()}
                  connectionState={recognizer.getConnectionState()}
                />
              )
              : (
                <GameVideoTile
                  kind="LOCAL"
                  label="내 영상"
                  stream={null}
                  cameraEnabled={false}
                  connectionState="DISCONNECTED"
                />
              )}
          </div>
          <div className={styles.waitingActions}>
            <button type="button" onClick={() => void startCameraPreview()} disabled={Boolean(localStream)}>
              <Camera aria-hidden="true" size={17} />카메라 미리보기
            </button>
            <button type="button" onClick={toggleCamera} disabled={!localStream}>
              {cameraEnabled ? <CameraOff aria-hidden="true" size={17} /> : <Camera aria-hidden="true" size={17} />}
              {cameraEnabled ? "카메라 끄기" : "카메라 켜기"}
            </button>
            <button
              type="button"
              className={room?.currentUserReady ? styles.primaryButton : undefined}
              onClick={() => void toggleReady()}
              disabled={!room || readyBusy || !gateway.setReady}
            >
              <Check aria-hidden="true" size={17} />{readyBusy ? "처리 중" : room?.currentUserReady ? "준비 취소" : "준비 완료"}
            </button>
            {isHost ? (
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!canRequestStart || startingGame}
                onClick={() => void startGame()}
              >
                <Play aria-hidden="true" size={17} />{startingGame ? "연결 준비 중" : "게임 시작"}
              </button>
            ) : null}
          </div>
          <p className={styles.startReason}>
            {isHost
              ? canRequestStart ? "시작 요청 시 서버가 두 참가자의 준비 상태를 최종 확인합니다." : "상대방 입장 후 내 준비를 완료해 주세요."
              : "준비 완료 후 방장의 시작을 기다려 주세요."}
          </p>
        </section>
      </div>
    </main>
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}
