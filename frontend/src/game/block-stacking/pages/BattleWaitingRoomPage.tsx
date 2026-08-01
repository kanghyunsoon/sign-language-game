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
  const [rejoinPromptOpen, setRejoinPromptOpen] = useState(() => mode === "BLOCK" && room?.status === "PLAYING");
  const [disconnectDefeatOpen, setDisconnectDefeatOpen] = useState(() => mode === "BLOCK" && room?.status === "FINISHED");
  const roomSocketRef = useRef<RoomRealtimeSocket | null>(null);
  const roomRef = useRef<BattleRoomDetail | null>(room);
  const rememberRoomRef = useRef<(next: BattleRoomDetail) => void>(() => undefined);
  const enteringGameRef = useRef(false);
  const startRtcAndEnterRef = useRef<() => Promise<void>>(async () => undefined);
  const leavePromiseRef = useRef<Promise<void> | null>(null);
  const leavingRef = useRef(false);

  const rememberRoom = useCallback((next: BattleRoomDetail) => {
    roomRef.current = next;
    setRoom(next);
    rememberSession({ ...next, currentUser: user });
  }, [rememberSession, user]);

  useEffect(() => {
    rememberRoomRef.current = rememberRoom;
  }, [rememberRoom]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    if (mode !== "BLOCK") return;
    let cancelled = false;
    const existingStream = sharedCameraSession.getStream();
    if (existingStream) {
      setLocalStream(existingStream);
      setCameraEnabled(sharedCameraSession.getVideoTrack()?.enabled ?? false);
      return;
    }
    // Acquire the camera while the players are preparing instead of waiting
    // until GAME_STARTED. The play route can then reuse the live track and
    // begin WebRTC negotiation immediately.
    void sharedCameraSession.start()
      .then((stream) => {
        if (cancelled) return;
        setLocalStream(stream);
        setCameraEnabled(sharedCameraSession.getVideoTrack()?.enabled ?? true);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause, "카메라를 시작하지 못했습니다."));
      });
    return () => { cancelled = true; };
  }, [mode, sharedCameraSession]);

  useEffect(() => {
    if (mode !== "BLOCK") return;
    if (room?.status === "PLAYING" && !enteringGameRef.current) setRejoinPromptOpen(true);
    if (room?.status === "FINISHED") {
      setRejoinPromptOpen(false);
      setDisconnectDefeatOpen(true);
    }
  }, [mode, room?.status]);

  const startRtcAndEnter = useCallback(async () => {
    // Realtime GAME_STARTED and the REST start response can arrive in either
    // order. Read the ref here so this path always uses the latest
    // authoritative room rather than the render that created the callback.
    const currentRoom = roomRef.current;
    if (!roomId || !currentRoom || currentRoom.status !== "PLAYING" || enteringGameRef.current) return;
    enteringGameRef.current = true;
    setStartingGame(true);
    setError(null);
    try {
      const stream = await sharedCameraSession.start();
      setLocalStream(stream);
      setCameraEnabled(sharedCameraSession.getVideoTrack()?.enabled ?? true);
      await battleMediaSession.connect(currentRoom, stream);
      navigate(`${lobbyPath}/${roomId}/play`, { replace: true });
    } catch (cause) {
      enteringGameRef.current = false;
      setStartingGame(false);
      setError(errorMessage(cause, "WebRTC 연결을 시작하지 못했습니다."));
    }
  }, [battleMediaSession, lobbyPath, navigate, roomId, sharedCameraSession]);

  useEffect(() => {
    startRtcAndEnterRef.current = startRtcAndEnter;
  }, [startRtcAndEnter]);

  useEffect(() => {
    if (!roomId || room || !roomSession) return;
    if (roomSession.roomId === roomId) rememberRoom(roomSession);
  }, [roomSession, rememberRoom, room, roomId]);

  useEffect(() => {
    const roomCode = roomRef.current?.roomCode;
    if (!roomId || !roomCode) return;
    let cancelled = false;
    void gateway.joinRoom(roomCode)
      .then((authoritative) => {
        if (cancelled || leavingRef.current || authoritative.roomId !== roomId) return;
        rememberRoomRef.current(authoritative);
      })
      .catch((cause) => {
        if (cancelled || leavingRef.current) return;
        rememberSession(null);
        setError(errorMessage(cause, "방 상태를 확인하지 못했습니다. 방 목록에서 다시 입장해 주세요."));
        navigate(lobbyPath, { replace: true });
      });
    return () => { cancelled = true; };
  }, [gateway, lobbyPath, navigate, rememberSession, roomId, room?.roomCode]);

  useEffect(() => {
    if (!roomId || !gateway.subscribeRooms) return;
    return gateway.subscribeRooms((rooms) => {
      const current = roomRef.current;
      if (!current) return;
      const summary = rooms.find((candidate) => candidate.roomId === current.roomId || candidate.roomCode === current.roomCode);
      if (!summary) return;
      if (summary.status === "PLAYING") {
        const playingRoom: BattleRoomDetail = {
          ...current,
          status: "PLAYING",
          canJoin: false,
          canStart: false,
        };
        rememberRoomRef.current(playingRoom);
        // A fresh GAME_STARTED event enters immediately. A player who returns
        // to an already-playing room must choose whether to resume instead.
        if (current.status === "PLAYING" && mode === "BLOCK") setRejoinPromptOpen(true);
        else void startRtcAndEnterRef.current();
        return;
      }

      if (summary.status === "FINISHED" && mode === "BLOCK") {
        rememberRoom({ ...current, status: "FINISHED", canJoin: summary.canJoin });
        setRejoinPromptOpen(false);
        setDisconnectDefeatOpen(true);
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
    }, (cause) => setError(errorMessage(cause, "대기실 실시간 상태를 갱신하지 못했습니다.")));
  }, [gateway, mode, roomId, rememberRoom]);

  useEffect(() => {
    if (!roomId || (room?.status !== "WAITING" && room?.status !== "FULL") || !room.roomCode) return undefined;
    const roomCode = room.roomCode;
    let checking = false;
    const checkStartedState = async () => {
      if (checking || enteringGameRef.current) return;
      checking = true;
      try {
        const authoritative = await gateway.joinRoom(roomCode);
        rememberRoomRef.current(authoritative);
        if (authoritative.status !== "PLAYING") return;
        await startRtcAndEnterRef.current();
      } catch {
        // Realtime remains the primary path. This fallback only recovers a
        // committed start whose GAME_STARTED broadcast was lost.
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void checkStartedState(), 1_500);
    return () => window.clearInterval(timer);
  }, [gateway, room?.roomCode, room?.status, roomId]);

  useEffect(() => {
    if (!roomId || !services.roomRealtimeSocketFactory) return;
    const socket = services.roomRealtimeSocketFactory.create(roomId);
    roomSocketRef.current = socket;
    const unsubscribe = socket.subscribe((message) => {
      if (message.type === "GAME_STARTED") {
        // The event can arrive before the REST start request resolves (and
        // before a failed start has been rolled back). Rejoin first and only
        // enter the play page from the backend's authoritative PLAYING state.
        void (async () => {
          const current = roomRef.current;
          if (!current?.roomCode) return;
          try {
            const authoritative = await gateway.joinRoom(current.roomCode);
            if (authoritative.status !== "PLAYING") return;
            rememberRoomRef.current(authoritative);
            await startRtcAndEnterRef.current();
          } catch (cause) {
            setError(errorMessage(cause, "게임 시작 상태를 확인하지 못했습니다."));
          }
        })();
      }
      if (message.type === "PEER_LEFT") {
        const current = roomRef.current;
        if (current) {
          const leftUserId = payloadUserId(message.payload);
          const newHostUserId = payloadUserId(message.payload, "newHostUserId");
          const remaining = current.participants
            .filter((participant) => !leftUserId || participant.userId !== leftUserId)
            .map((participant) => ({ ...participant, isHost: participant.userId === newHostUserId }));
          const hostUserId = newHostUserId ?? remaining.find((participant) => participant.isHost)?.userId ?? current.hostUserId;
          rememberRoomRef.current({
            ...current,
            status: "WAITING",
            hostUserId,
            playerCount: remaining.length,
            canJoin: true,
            hostReady: remaining.find((participant) => participant.userId === hostUserId)?.ready ?? false,
            guestReady: false,
            currentUserReady: remaining.find((participant) => participant.userId === user.userId)?.ready ?? false,
            canStart: false,
            participants: remaining,
          });
        }
        setError("상대방이 방을 나갔습니다.");
      }
      if (message.type === "PEER_READY_CHANGED") {
        const current = roomRef.current;
        const changedUserId = payloadUserId(message.payload);
        const isReady = payloadBoolean(message.payload, "isReady");
        if (current && changedUserId && isReady !== null) {
          const participants = current.participants.map((participant) =>
            participant.userId === changedUserId ? { ...participant, ready: isReady } : participant
          );
          const hostReady = changedUserId === current.hostUserId ? isReady : current.hostReady;
          const guestReady = changedUserId !== current.hostUserId ? isReady : current.guestReady;
          rememberRoomRef.current({
            ...current,
            hostReady,
            guestReady,
            currentUserReady: changedUserId === user.userId ? isReady : current.currentUserReady,
            canStart: Boolean(current.playerCount >= current.maxPlayers && hostReady && guestReady),
            participants,
          });
        }
      }
      if (message.type === "ERROR") {
        const code = payloadString(message.payload, "code");
        if (code === "NOT_ROOM_PARTICIPANT" || code === "ROOM_NOT_FOUND") {
          rememberSession(null);
          void battleMediaSession.disconnect().finally(() => sharedCameraSession.stop());
          navigate(lobbyPath, { replace: true });
          return;
        }
        setError(payloadString(message.payload, "message") ?? "방 실시간 연결에서 오류가 발생했습니다.");
      }
    });
    const unsubscribeError = socket.subscribeError(() => setRealtimeState("ERROR"));
    setRealtimeState("CONNECTING");
    void socket.connect()
      .then(() => {
        setRealtimeState("CONNECTED");
        setError(null);
      })
      .catch((cause) => {
        setRealtimeState("ERROR");
        setError(errorMessage(cause, "방 실시간 연결에 실패했습니다."));
      });
    return () => {
      unsubscribe();
      unsubscribeError();
      if (roomSocketRef.current === socket) roomSocketRef.current = null;
      // The media session reuses this exact room socket for WebRTC signaling.
      // Closing it while the waiting route unmounts would make the backend
      // observe a participant disconnect during the transition to /play.
      if (!enteringGameRef.current) socket.disconnect();
    };
  }, [gateway, roomId, services.roomRealtimeSocketFactory]);

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
    const nextReady = !room.currentUserReady;
    const previous = room;
    const isCurrentUserHost = room.hostUserId === user.userId;
    const optimisticHostReady = isCurrentUserHost ? nextReady : room.hostReady;
    const optimisticGuestReady = isCurrentUserHost ? room.guestReady : nextReady;
    rememberRoom({
      ...room,
      hostReady: optimisticHostReady,
      guestReady: optimisticGuestReady,
      currentUserReady: nextReady,
      canStart: Boolean(room.playerCount >= room.maxPlayers && optimisticHostReady && optimisticGuestReady),
      participants: room.participants.map((participant) =>
        participant.userId === user.userId ? { ...participant, ready: nextReady } : participant
      ),
    });
    setReadyBusy(true);
    setError(null);
    try {
      const next = await gateway.setReady(roomId, nextReady);
      rememberRoom(next);
    } catch (cause) {
      rememberRoom(previous);
      setError(errorMessage(cause, "준비 상태를 변경하지 못했습니다."));
    } finally {
      setReadyBusy(false);
    }
  };

  const startGame = async () => {
    if (!roomId || !room || !room.roomCode || startingGame || !room.hostReady || !room.guestReady || room.playerCount < room.maxPlayers) return;
    setStartingGame(true);
    setError(null);
    try {
      await gateway.startGame(roomId);
      // The play page may mount before the WebRTC data channel finishes opening.
      // Persist the server transition now so that page can keep waiting for it.
      rememberRoom({ ...room, status: "PLAYING", canStart: false });
      // The backend also broadcasts GAME_STARTED. Calling this here covers the host
      // immediately; the ref prevents the broadcast from starting a second session.
      await startRtcAndEnter();
    } catch (cause) {
      // The room state is committed before the backend broadcasts
      // GAME_STARTED. A post-commit broadcast failure can therefore surface
      // as HTTP 500 even though this match is already IN_PROGRESS. Rejoining
      // is idempotent and gives us the authoritative room state.
      try {
        const authoritative = await gateway.joinRoom(room.roomCode);
        if (authoritative.status === "PLAYING") {
          rememberRoom(authoritative);
          await startRtcAndEnterRef.current();
          return;
        }
      } catch {
        // Preserve the original start failure when state recovery is unavailable.
      }
      setStartingGame(false);
      setError(errorMessage(cause, "두 참가자가 모두 준비됐는지 확인해 주세요."));
    }
  };

  const leaveRoom = useCallback((): Promise<void> => {
    if (!roomId) return Promise.resolve();
    if (leavePromiseRef.current) return leavePromiseRef.current;

    leavingRef.current = true;
    setLeaving(true);
    // A browser popstate changes the route before the asynchronous leave can
    // finish, so remove the local re-entry action as soon as leaving begins.
    rememberSession(null);
    const roomBeforeLeave = roomRef.current;

    const leavePromise = (async () => {
      roomSocketRef.current?.disconnect();
      try {
        await gateway.leaveRoom(roomId);
      } catch (cause) {
        // 403 means the server has already removed this participant. For a
        // genuine network/server failure, restore the bookmark so the user can
        // retry leaving instead of becoming stuck in an unknown active room.
        if (!isAlreadyLeft(cause) && roomBeforeLeave) {
          rememberSession({ ...roomBeforeLeave, currentUser: user });
        }
        console.warn("Remote room leave failed; continuing local cleanup.", cause);
      }
      await battleMediaSession.disconnect().catch(() => undefined);
      sharedCameraSession.stop();
      activePlayerSession?.clearRegistration();
      navigate(lobbyPath, { replace: true });
    })();

    leavePromiseRef.current = leavePromise;
    return leavePromise;
  }, [activePlayerSession, battleMediaSession, gateway, lobbyPath, navigate, rememberSession, roomId, sharedCameraSession, user]);

  useEffect(() => {
    const handleBrowserBack = () => { void leaveRoom(); };
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, [leaveRoom]);

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
      {rejoinPromptOpen ? <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="battle-rejoin-title"><section className={styles.modal}><header><div><span>진행 중인 게임</span><h2 id="battle-rejoin-title">아직 진행 중인 게임이 있습니다.</h2></div></header><form onSubmit={(event) => { event.preventDefault(); setRejoinPromptOpen(false); void startRtcAndEnter(); }}><p>재입장 하시겠습니까?</p><div className={styles.modalActions}><button type="button" onClick={() => setRejoinPromptOpen(false)}>나중에</button><button type="submit" className={styles.primaryButton} disabled={startingGame}>재입장</button></div></form></section></div> : null}
      {disconnectDefeatOpen ? <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="battle-disconnect-title"><section className={styles.modal}><header><div><span>게임 종료</span><h2 id="battle-disconnect-title">연결이 되지 않아 패배 처리되었습니다 ㅠㅠ</h2></div></header><form onSubmit={(event) => { event.preventDefault(); setDisconnectDefeatOpen(false); rememberSession(null); navigate(lobbyPath, { replace: true }); }}><p>상대가 10초 안에 재접속하지 않아 게임이 종료되었습니다.</p><div className={styles.modalActions}><button type="submit" className={styles.primaryButton}>확인</button></div></form></section></div> : null}
    </main>
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function isAlreadyLeft(cause: unknown): boolean {
  return cause instanceof Error && /\((?:403|404|410)\)/.test(cause.message);
}

function payloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadUserId(payload: unknown, key = "userId"): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function payloadBoolean(payload: unknown, key: string): boolean | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : null;
}
