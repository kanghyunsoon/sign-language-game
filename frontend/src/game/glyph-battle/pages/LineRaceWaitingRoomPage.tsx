import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGameModuleContext } from "../../app/GameModuleContext";
import { ParticipantList } from "../../block-stacking/battle/components/ParticipantList";
import { GameVideoTile } from "../../media/components/GameVideoTile";
import type {
  MediaConnectionState,
  RemoteGameParticipant,
} from "../../media/core/mediaTypes";
import type { LineRaceRoomDetail } from "../room";
import styles from "../components/LineRaceRoom.module.css";
import { HandCamera, PythonWebSocketSignRecognizer, useGameRecognitionSession, useGameRecognitionSnapshot } from "../../recognition";

export function LineRaceWaitingRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const context = useGameModuleContext();
  const {
    user,
    config,
    services,
    sharedCameraSession,
    activePlayerSession,
    lineRaceRoomSession,
  } = context;
  const lineRaceMediaSession = context.lineRaceMediaSession;
  const setLineRaceRoomSession = context.setLineRaceRoomSession;
  if (!lineRaceMediaSession || !setLineRaceRoomSession)
    throw new Error("라인 레이스 세션이 구성되지 않았습니다.");
  const gateway = services.lineRaceRoomGateway;
  const recognizer=useMemo(()=>new PythonWebSocketSignRecognizer({url:config.aiWebSocketUrl}),[config.aiWebSocketUrl]);
  const recognitionSession=useGameRecognitionSession(recognizer,sharedCameraSession,activePlayerSession);
  const recognitionSnapshot=useGameRecognitionSnapshot(recognitionSession);
  const devReady = import.meta.env.DEV && new URLSearchParams(window.location.search).get("devReady") === "1";
  const playerRegistered=devReady||!activePlayerSession||recognitionSnapshot.activePlayerState==="LOCKED";
  const [room, setRoom] = useState<LineRaceRoomDetail | null>(() =>
    lineRaceRoomSession?.roomId === roomId
      ? (lineRaceRoomSession ?? null)
      : null,
  );
  const [local, setLocal] = useState(() => sharedCameraSession.getStream());
  const [localCameraState, setLocalCameraState] = useState<LocalCameraState>(() =>
    hasLiveVideoTrack(sharedCameraSession.getStream()) ? "ON" : "NEEDS_CONNECTION",
  );
  const [remote, setRemote] = useState<readonly RemoteGameParticipant[]>(() =>
    lineRaceMediaSession.getRemoteParticipants(),
  );
  const [rtc, setRtc] = useState<MediaConnectionState>(() =>
    lineRaceMediaSession.getConnectionState(),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const bot = room?.participants.find((participant) => participant.isBot);
  const refreshMedia = useCallback(() => {
    const stream = sharedCameraSession.getStream();
    setLocal(stream);
    setLocalCameraState(hasLiveVideoTrack(stream) ? "ON" : "NEEDS_CONNECTION");
    setRemote(lineRaceMediaSession.getRemoteParticipants());
    setRtc(lineRaceMediaSession.getConnectionState());
  }, [lineRaceMediaSession, sharedCameraSession]);
  const load = useCallback(async () => {
    if (!gateway || !roomId) return;
    try {
      const detail = await gateway.getRoom(roomId);
      setRoom(detail);
      setLineRaceRoomSession({ ...detail, currentUser: user });
      const detailHasBot = detail.participants.some((participant) => participant.isBot);
      if (detailHasBot) {
        if (lineRaceMediaSession.getConnectionState() !== "DISCONNECTED") await lineRaceMediaSession.disconnect();
      } else await lineRaceMediaSession.syncParticipants(detail);
      setError(null);
    } catch (cause) {
      setError(text(cause));
    }
  }, [gateway, lineRaceMediaSession, roomId, setLineRaceRoomSession, user]);
  useEffect(
    () => lineRaceMediaSession.subscribe(refreshMedia),
    [lineRaceMediaSession, refreshMedia],
  );
  useEffect(() => {
    const track = liveVideoTrack(local);
    if (!track) {
      setLocalCameraState((current) => current === "STARTING" ? current : "NEEDS_CONNECTION");
      return;
    }
    setLocalCameraState("ON");
    const handleEnded = () => setLocalCameraState("NEEDS_CONNECTION");
    track.addEventListener("ended", handleEnded);
    return () => track.removeEventListener("ended", handleEnded);
  }, [local]);
  useEffect(() => {
    void load();
    // A guest must receive the host's start transition before the short match
    // countdown expires.  The normal lobby polling cadence (2.5s) leaves too
    // little time for a 3s countdown, so keep the active waiting room fresh.
    const waitingRoomPollingMs = Math.min(
      config.battleRoomPollingIntervalMs ?? 2500,
      500,
    );
    const timer = window.setInterval(
      () => void load(),
      waitingRoomPollingMs,
    );
    return () => window.clearInterval(timer);
  }, [config.battleRoomPollingIntervalMs, load]);
  useEffect(() => {
    if (playerRegistered && room?.status === "PLAYING" && room.activeMatchId)
      navigate(`/game/turn-battle/matches/${room.activeMatchId}`, { replace: true });
  }, [navigate, playerRegistered, room?.activeMatchId, room?.status]);
  useEffect(() => {
    if (!room || (!bot && lineRaceMediaSession.getConnectionState() !== "DISCONNECTED"))
      return;
    if (!hasLiveVideoTrack(sharedCameraSession.getStream())) setLocalCameraState("STARTING");
    void sharedCameraSession
      .start()
      .then(async (stream) => {
        setLocal(stream);
        setLocalCameraState(hasLiveVideoTrack(stream) ? "ON" : "NEEDS_CONNECTION");
        if (!bot) await lineRaceMediaSession.connect(room, stream);
        refreshMedia();
      })
      .catch((cause) => {
        setLocalCameraState("NEEDS_CONNECTION");
        setError((bot ? "카메라 연결 경고: " : "영상 연결 경고: ") + text(cause));
      });
  }, [bot, lineRaceMediaSession, refreshMedia, room, sharedCameraSession]);
  const leave = async () => {
    if (!gateway || !roomId) return;
    setBusy(true);
    try {
      await gateway.leaveRoom(roomId);
      await lineRaceMediaSession.disconnect();
      sharedCameraSession.stop();
      activePlayerSession?.clearRegistration();
      setLineRaceRoomSession(null);
      navigate("/game/turn-battle", { replace: true });
    } catch (cause) {
      setError(text(cause));
      setBusy(false);
    }
  };
  const cameraReady = devReady || localCameraState === "ON";
  const rtcCameraReady = devReady || Boolean(bot) || lineRaceMediaSession.isCameraEnabled();
  const dataChannelReady = devReady || Boolean(bot) || lineRaceMediaSession.getGameDataChannel?.()?.isOpen() === true;
  const canStartMatch = Boolean(room?.canStart) && cameraReady && rtcCameraReady && dataChannelReady && playerRegistered && !busy;
  const start = async () => {
    if (!gateway || !roomId || !canStartMatch) return;
    setBusy(true);
    try {
      await gateway.startGame(roomId);
      const started = await gateway.getRoom(roomId);
      setLineRaceRoomSession({ ...started, currentUser: user });
      if (started.activeMatchId) navigate(`/game/turn-battle/matches/${started.activeMatchId}`);
    } catch (cause) {
      setError(text(cause));
      setBusy(false);
    }
  };
  const peer = remote[0] ?? null;
  const isHost = room?.hostUserId === user.userId;
  const startBlockedReason = !cameraReady
    ? "카메라 연결 필요"
    : !rtcCameraReady
      ? "RTC 카메라 송출 필요"
    : !playerRegistered
      ? "사용자 자세 등록 필요"
      : !dataChannelReady
        ? "WebRTC 게임 채널 연결 중"
        : !room?.canStart
          ? "상대 참가자 준비 대기 중"
          : busy
            ? "요청 처리 중"
            : "경기 시작 준비 완료";
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <small>LINE_RACE · 대기방</small>
          <h1>{room?.title ?? "방 정보 불러오는 중"}</h1>
          <p>
            방 코드: {room?.roomCode ?? "공개방"} · {room?.playerCount ?? 0}/2명
            · {(room?.matchDurationMs ?? 0) / 1000}초
          </p>
        </div>
        <div className={styles.actions}>
          <button onClick={() => void load()}>새로고침</button>
          <button
            className={styles.danger}
            disabled={busy}
            onClick={() => void leave()}
          >
            방 나가기
          </button>
        </div>
      </header>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <div className={styles.status}>
        <span>사용자 자세 등록 <strong>{playerRegistered ? "완료" : "등록 필요"}</strong></span>
        <span>
          카메라{" "}
          <strong>
            {localCameraState === "ON"
              ? "켜짐"
              : localCameraState === "STARTING"
                ? "준비 중"
                : "연결 필요"}
          </strong>
        </span>
        <span>
          Python AI <strong>경기 화면에서 연결됨</strong>
        </span>
        <span>
          게임 전송 <strong>{dataChannelReady ? "WebRTC DataChannel 연결됨" : "WebRTC DataChannel 연결 중"}</strong>
        </span>
        <span>
          RTC Signaling <strong>{bot ? "사용 안 함 (정상)" : rtc}</strong>
        </span>
        <span>
          상대 참가자 <strong>{bot ? "BOT · 정상" : (peer?.connectionState ?? "DISCONNECTED")}</strong>
        </span>
        <span>
          상대 카메라 <strong>{bot ? "사용 안 함 (정상)" : peer?.cameraEnabled ? "켜짐" : "꺼짐"}</strong>
        </span>
      </div>
      <div className={styles.waiting}>
        <aside className={styles.panel}>
          {room ? (
            <ParticipantList
              participants={room.participants}
              currentUserId={user.userId}
              maxPlayers={2}
            />
          ) : null}
          <h2>경기 설정</h2>
          <p>{room?.symbolRange.join(" ")}</p>
          <p>게임 종류: {room?.gameType}</p>
        </aside>
        <section className={styles.panel}>
          <div className={styles.video}>
            {local?<HandCamera sharedStream={local} autoStart activePlayerSession={activePlayerSession} recognitionSession={recognitionSession} performanceMonitor={recognizer.getPerformanceMonitor()} temporalDecoder={recognizer.getTemporalDecoder()} connectionState={recognizer.getConnectionState()}/>:<GameVideoTile kind="LOCAL" label="내 영상" stream={null} cameraEnabled={false} connectionState="DISCONNECTED"/>}
            <GameVideoTile
              kind="REMOTE"
              label={bot?.displayName ?? peer?.displayName ?? "상대방"}
              stream={peer?.stream ?? null}
              cameraEnabled={peer?.cameraEnabled ?? false}
              connectionState={bot ? "CONNECTED" : (peer?.connectionState ?? "DISCONNECTED")}
            />
          </div>
          <div className={styles.actions}>
            {isHost ? (
              <button
                className={styles.primary}
                disabled={!canStartMatch}
                onClick={() => void start()}
              >
                경기 시작
              </button>
            ) : (
              <p>방장이 경기를 시작할 때까지 기다려 주세요.</p>
            )}
          </div>
          {isHost && !canStartMatch ? <p role="status">경기 시작 준비: <strong>{startBlockedReason}</strong></p> : null}
          {!bot && rtc === "FAILED" ? (
            <p>
              영상 연결에 실패했지만 게임 WebSocket이 연결되어 있으면 경기를
              시작할 수 있습니다.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
function text(cause: unknown) {
  return cause instanceof Error ? cause.message : "요청 처리에 실패했습니다.";
}

type LocalCameraState = "STARTING" | "ON" | "NEEDS_CONNECTION";

function liveVideoTrack(stream: MediaStream | null): MediaStreamTrack | null {
  return stream?.getVideoTracks().find((track) => track.readyState === "live") ?? null;
}

function hasLiveVideoTrack(stream: MediaStream | null): boolean {
  return liveVideoTrack(stream) !== null;
}
