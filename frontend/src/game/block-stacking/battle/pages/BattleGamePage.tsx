import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { GameRenderer } from "../../render/types";
import { DEFAULT_PHYSICS_CONFIG } from "../../physics/types";
import { MatterPhysicsWorld } from "../../physics/MatterPhysicsWorld";
import { useGameModuleContext } from "../../../app/GameModuleContext";
import { GameVideoTile } from "../../../media/components/GameVideoTile";
import type { RemoteGameParticipant } from "../../../media/core/mediaTypes";
import { HandCamera } from "../../../recognition/mediapipe/HandCamera";
import { PythonWebSocketSignRecognizer } from "../../../recognition/websocket/PythonWebSocketSignRecognizer";
import { RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG } from "../../../recognition/runtime";
import { RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG } from "../../../recognition/temporal";
import type { BattleControllerSnapshot } from "../core/BattleController";
import type { MatchFinishedEvent } from "../transport/battleTransportTypes";
import { BattleController } from "../core/BattleController";
import { BattleExitCoordinator } from "../core/BattleExitCoordinator";
import { BattleLocalBoardRuntime } from "../core/BattleLocalBoardRuntime";
import { BATTLE_DANGER_LINE_RATIO, BATTLE_DANGER_LINE_Y, BATTLE_LETTER_SIZE, DEFAULT_BATTLE_RUNTIME_CONFIG } from "../core/BattleRuntimeConfig";
import { DefaultBattleAttackEffect } from "../attack/DefaultBattleAttackEffect";
import { RemotePhysicsBoard } from "../sync/RemotePhysicsBoard";
import { RemoteBoardRenderer } from "../render/RemoteBoardRenderer";
import { LocalBoardPublisher } from "../sync/LocalBoardPublisher";
import { BattleBoardPanel } from "../components/BattleBoardPanel";
import { settledTowerHeightRatio } from "../../runtime/towerHeight";
import { BattleConnectionPanel } from "../components/BattleConnectionPanel";
import { BattleResultModal } from "../components/BattleResultModal";
import letterOtter from "../../assets/solo-letter-otter.png";
import styles from "../battle.module.css";
import { createDevAuthHeaders } from "../../../app/devAuthHeaders";
import { BattleResultClient, BattleResultRequestError } from "../../../results/BattleResultClient";

const INITIAL: BattleControllerSnapshot = { state: "IDLE", gameConnectionState: "DISCONNECTED", aiConnectionState: "DISCONNECTED", countdownMs: 0, reconnectDeadlineAt: null, score: 0, combo: 0, maxCombo: 0, removedCount: 0, targetSymbol: null, prediction: null, message: "Waiting for board initialization.", result: null };

export function BattleGamePage() {
  const { roomId = "" } = useParams(); const navigate = useNavigate();
  const { user, accessToken, config, services, battleMediaSession, sharedCameraSession, activePlayerSession, battleRoomSession, setBattleRoomSession } = useGameModuleContext();
  const transport = useMemo(() => services.battleGameTransportFactory.create(roomId), [roomId, services]);
  const resultClient = useMemo(() => new BattleResultClient({ apiBaseUrl: config.roomApiBaseUrl, userId: user.userId, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : createDevAuthHeaders(user) }), [accessToken, config.roomApiBaseUrl, user]);
  const recognizer = useMemo(() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl, aiInferenceFps: RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG.aiInferenceFps, decoderConfig: RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG }), [config.aiWebSocketUrl]);
  const replica = useMemo(() => new RemotePhysicsBoard(), []);
  const exitCoordinator = useMemo(() => new BattleExitCoordinator({ roomGateway: services.battleRoomGateway, mediaSession: battleMediaSession, cameraSession: sharedCameraSession, clearRoomSession: () => setBattleRoomSession(null), navigate: (destination) => navigate(destination, { replace: true }) }), [battleMediaSession, navigate, services.battleRoomGateway, setBattleRoomSession, sharedCameraSession]);
  const [snapshot, setSnapshot] = useState(INITIAL); const [participants, setParticipants] = useState<readonly RemoteGameParticipant[]>(() => battleMediaSession.getRemoteParticipants());
  const [resultBusy, setResultBusy] = useState(false); const [resultError, setResultError] = useState<string | null>(null);
  const [resultRecorded, setResultRecorded] = useState(false);
  const [claimedSymbol, setClaimedSymbol] = useState<{ readonly id: number; readonly symbol: string; readonly winnerPlayerId: string } | null>(null);
  const claimEffectTimerRef = useRef<number | null>(null);
  const [mediaReady, setMediaReady] = useState(() => battleMediaSession.getConnectionState() === "CONNECTED");
  const [cameraState, setCameraState] = useState<"CONNECTED" | "DISCONNECTED">(() => sharedCameraSession.getVideoTrack()?.readyState === "live" ? "CONNECTED" : "DISCONNECTED");
  const [rtcState, setRtcState] = useState(() => battleMediaSession.getConnectionState()); const [localRenderer, setLocalRenderer] = useState<GameRenderer | null>(null); const [remoteRenderer, setRemoteRenderer] = useState<GameRenderer | null>(null);
  const resultReportedRef = useRef(false);
  const resultReportPromiseRef = useRef<Promise<void> | null>(null);
  const controllerRef = useRef<BattleController | null>(null); const localRuntimeRef = useRef<BattleLocalBoardRuntime | null>(null); const localViewportRef = useRef({ width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight }); const remoteViewportRef = useRef({ width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight }); const remoteLoopRef = useRef<number | null>(null);
  const settledTowerHeightsRef = useRef({ local: 0, remote: 0 });
  const [towerHeights, setTowerHeights] = useState({ local: 0, remote: 0 });
  const localIsHost = battleRoomSession?.hostUserId === user.userId;
  const markRoomWaiting = useCallback(() => {
    if (!battleRoomSession) return;
    setBattleRoomSession({
      ...battleRoomSession,
      status: battleRoomSession.playerCount >= battleRoomSession.maxPlayers ? "FULL" : "WAITING",
      hostReady: false,
      guestReady: false,
      currentUserReady: false,
      canStart: false,
      activeMatchId: null,
    });
  }, [battleRoomSession, setBattleRoomSession]);
  const reportMatchResult = useCallback((result: MatchFinishedEvent): Promise<void> => {
    if (!Number.isSafeInteger(Number(roomId))) return Promise.resolve();
    // The result endpoint transitions the room out of IN_PROGRESS. Having both
    // browsers post the same result deterministically creates a 409 race.
    if (!localIsHost) return Promise.resolve();
    if (resultReportPromiseRef.current) return resultReportPromiseRef.current;
    setResultBusy(true);
    setResultError(null);
    const request = resultClient.reportResult(Number(roomId), result.winnerPlayerId)
      .then(() => {
        // Swagger guarantees a 201 result returns the room to WAITING. Update
        // the persisted copy at the same time so it cannot issue a stale
        // ready/start request before the user presses the rematch button.
        markRoomWaiting();
        setResultRecorded(true);
        try {
          transport.send({ type: "RESULT_RECORDED_COMMAND", commandId: crypto.randomUUID(), matchId: result.matchId, recordedAt: Date.now() });
        } catch {
          // The backend write already succeeded. A closed peer channel must not
          // turn the completed result into a false HTTP failure for the host.
        }
      })
      .catch((cause) => {
        resultReportPromiseRef.current = null;
        if (cause instanceof BattleResultRequestError && (cause.status === 403 || cause.status === 409)) {
          // This is not a retryable transport failure: the authoritative room
          // no longer accepts a result from this browser. Drop all stale local
          // state before any later ready/start request can reuse it.
          setBattleRoomSession(null);
          void battleMediaSession.disconnect().finally(() => sharedCameraSession.stop());
        }
        setResultError(cause instanceof Error ? cause.message : "결과 전송에 실패했습니다.");
        throw cause;
      })
      .finally(() => setResultBusy(false));
    resultReportPromiseRef.current = request;
    return request;
  }, [battleMediaSession, localIsHost, markRoomWaiting, resultClient, roomId, setBattleRoomSession, sharedCameraSession, transport]);
  const refreshMedia = useCallback(() => {
    const nextState = battleMediaSession.getConnectionState();
    setParticipants(battleMediaSession.getRemoteParticipants());
    setRtcState(nextState);
    setMediaReady(nextState === "CONNECTED");
  }, [battleMediaSession]);
  useEffect(() => battleMediaSession.subscribe(refreshMedia), [battleMediaSession, refreshMedia]);

  useEffect(() => {
    if (battleMediaSession.getConnectionState() === "CONNECTED") {
      setMediaReady(true);
      return;
    }
    if (!battleRoomSession || battleRoomSession.status !== "PLAYING") return;
    const authoritativeRoomCode = battleRoomSession.roomCode;
    if (!authoritativeRoomCode) {
      setBattleRoomSession(null);
      navigate("/game/battle", { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const authoritative = await services.battleRoomGateway.joinRoom(authoritativeRoomCode);
        if (authoritative.status !== "PLAYING") {
          if (!cancelled) {
            setBattleRoomSession(authoritative.status === "FINISHED" ? null : authoritative);
            navigate(authoritative.status === "FINISHED" ? "/game/battle" : `/game/battle/${roomId}`, { replace: true });
          }
          return;
        }
        const stream = await sharedCameraSession.start();
        await battleMediaSession.connect(authoritative, stream);
        // `connect` finishes after signaling and peer setup, not after the
        // RTCPeerConnection/DataChannel is open. Starting the game here races
        // the channel handshake and leaves the controller stuck CONNECTING.
        // The media-session subscription above is the single authority that
        // enables the board once it reports CONNECTED.
        if (!cancelled) refreshMedia();
      } catch (cause) {
        if (!cancelled) setResultError(cause instanceof Error ? `게임 재연결에 실패했습니다: ${cause.message}` : "게임 재연결에 실패했습니다.");
      }
    })();
    return () => { cancelled = true; };
  // Re-run only when media changes state: a FAILED mesh session must be
  // recreated from the authoritative PLAYING room rather than leaving this
  // page permanently gated after a transient ICE/DataChannel failure.
  }, [battleMediaSession, battleRoomSession, navigate, refreshMedia, roomId, rtcState, services.battleRoomGateway, setBattleRoomSession, sharedCameraSession]);

  useEffect(() => { const track = sharedCameraSession.getVideoTrack(); const update = () => setCameraState(track?.readyState === "live" && track.enabled ? "CONNECTED" : "DISCONNECTED"); update(); if (!track) return; track.addEventListener("ended", update); track.addEventListener("mute", update); track.addEventListener("unmute", update); return () => { track.removeEventListener("ended", update); track.removeEventListener("mute", update); track.removeEventListener("unmute", update); }; }, [sharedCameraSession]);

  useEffect(() => {
    if (!localRenderer || !remoteRenderer || !roomId || !mediaReady) return;
    const physics = new MatterPhysicsWorld({ ...DEFAULT_PHYSICS_CONFIG, width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight, letterWidth: BATTLE_LETTER_SIZE, letterHeight: BATTLE_LETTER_SIZE, letterColliderPadding: 7, rotationInertiaScale: 1.15, restitution: 0 });
    const runtime = new BattleLocalBoardRuntime(physics, localRenderer, DEFAULT_BATTLE_RUNTIME_CONFIG); runtime.resize(localViewportRef.current.width, localViewportRef.current.height); const attack = new DefaultBattleAttackEffect();
    const controller = new BattleController({ playerId: user.userId, roomId, initialMatchId: battleRoomSession?.activeMatchId ?? undefined, transport, localBoard: runtime, remoteBoard: replica, attackEffect: attack, recognizer, sharedTargetMode: true, onMatchStarted: (matchId) => runtime.setPublisher(new LocalBoardPublisher(transport, DEFAULT_BATTLE_RUNTIME_CONFIG.sync, matchId, user.userId)), onSharedTargetClaimed: (event) => {
      const effect = { id: event.acceptedAt, symbol: event.symbol, winnerPlayerId: event.winnerPlayerId };
      setClaimedSymbol(effect);
      if (claimEffectTimerRef.current !== null) window.clearTimeout(claimEffectTimerRef.current);
      claimEffectTimerRef.current = window.setTimeout(() => { claimEffectTimerRef.current = null; setClaimedSymbol(null); }, 2_300);
    } });
    localRuntimeRef.current = runtime; controllerRef.current = controller; const unsubscribe = controller.subscribe(setSnapshot);
    void controller.connect({ url: config.gameWebSocketUrl, roomId, playerId: user.userId, accessToken, headers: accessToken ? undefined : createDevAuthHeaders(user), hostPlayerId: battleRoomSession?.hostUserId, playerIds: [...new Set(battleRoomSession?.participants.map((participant) => participant.userId) ?? [user.userId])] });
    // Opponent blocks are spawned locally after the server confirms them.
    // Their motion is independent of remote transform packet timing.
    const remote = new RemoteBoardRenderer(remoteRenderer, replica);
    const renderRemote = (at: number) => {
      remote.render(at);
      remoteLoopRef.current = requestAnimationFrame(renderRemote);
    };
    remoteLoopRef.current = requestAnimationFrame(renderRemote);
    return () => { if (remoteLoopRef.current !== null) cancelAnimationFrame(remoteLoopRef.current); if (claimEffectTimerRef.current !== null) window.clearTimeout(claimEffectTimerRef.current); remoteLoopRef.current = null; unsubscribe(); controller.dispose(); controllerRef.current = null; localRuntimeRef.current = null; remote.clear(); };
  }, [accessToken, battleRoomSession?.activeMatchId, config.gameWebSocketUrl, localRenderer, mediaReady, recognizer, remoteRenderer, replica, roomId, transport, user]);

  useEffect(() => {
    let frame = 0;
    const sampleTowerHeights = () => {
      const localViewport = localViewportRef.current;
      const remoteViewport = remoteViewportRef.current;
      const next = {
        local: settledTowerHeightRatio(settledTowerHeightsRef.current.local, localRuntimeRef.current?.getStates() ?? [], localViewport.height, localViewport.height * BATTLE_DANGER_LINE_RATIO, BATTLE_LETTER_SIZE),
        remote: settledTowerHeightRatio(settledTowerHeightsRef.current.remote, replica.getStates(), remoteViewport.height, remoteViewport.height * BATTLE_DANGER_LINE_RATIO, BATTLE_LETTER_SIZE),
      };
      settledTowerHeightsRef.current = next;
      setTowerHeights((current) => Math.abs(current.local - next.local) < .001 && Math.abs(current.remote - next.remote) < .001 ? current : next);
      frame = requestAnimationFrame(sampleTowerHeights);
    };
    frame = requestAnimationFrame(sampleTowerHeights);
    return () => cancelAnimationFrame(frame);
  }, [localRenderer, remoteRenderer, replica]);

  useEffect(() => {
    const result = snapshot.result;
    if (!result || resultReportedRef.current) return;
    resultReportedRef.current = true;
    void reportMatchResult(result).catch(() => { resultReportedRef.current = false; });
  }, [reportMatchResult, snapshot.result]);

  useEffect(() => transport.subscribe((message) => {
    if (message.type !== "RESULT_RECORDED") return;
    const result = controllerRef.current?.snapshot().result;
    if (result && result.matchId !== message.matchId) return;
    markRoomWaiting();
    setResultRecorded(true);
  }), [markRoomWaiting, transport]);

  const localStream = sharedCameraSession.getStream(); const opponent = participants[0] ?? null;
  const returnToWaiting = async () => { if (!roomId || resultBusy) return; setResultBusy(true); setResultError(null); try {
    await services.battleRoomGateway.returnToWaiting(roomId);
    if (battleRoomSession) setBattleRoomSession({
      ...battleRoomSession,
      status: battleRoomSession.playerCount >= battleRoomSession.maxPlayers ? "FULL" : "WAITING",
      hostReady: false,
      guestReady: false,
      currentUserReady: false,
      canStart: false,
      activeMatchId: null,
    });
    navigate(`/game/battle/${roomId}`, { replace: true });
  } catch (cause) { setResultError(cause instanceof Error ? cause.message : "대기방으로 돌아가지 못했습니다."); setResultBusy(false); } };
  const leaveBattle = async (destination: string) => { if (!roomId || resultBusy) return; setResultBusy(true); setResultError(null); try { await exitCoordinator.leaveRoom(roomId, destination); activePlayerSession?.clearRegistration(); } catch (cause) { setResultError(cause instanceof Error ? cause.message : "방을 나가지 못했습니다."); setResultBusy(false); } };
  const forfeitAndLeave = async () => {
    const forfeited = controllerRef.current?.forfeit() ?? false;
    // Give the P2P data channel one short turn to deliver MATCH_FINISHED
    // before this browser releases the game and media connections.
    if (forfeited) await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
    const result = controllerRef.current?.snapshot().result;
    if (result) {
      try {
        // reportResult receives the winner. The backend records the other
        // participant as the loser under the documented room-result contract.
        await reportMatchResult(result);
      } catch {
        return;
      }
    }
    await leaveBattle("/game/battle");
  };
  useEffect(() => {
    const handleBrowserBack = () => { void forfeitAndLeave(); };
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  });
  const localPlayerLabel = localIsHost ? "PLAYER 1" : "PLAYER 2";
  const remotePlayerLabel = localIsHost ? "PLAYER 2" : "PLAYER 1";
  const showSharedTarget = snapshot.state === "COUNTDOWN" || snapshot.state === "PLAYING" || snapshot.state === "RECONNECTING";
  return <main className={`${styles.page} ${styles.battleFixedPage}`}>
    <header className={styles.topbar}><div><h1>1:1 지문자 대전</h1><p>방 {roomId || "-"}</p></div><BattleConnectionPanel game={snapshot.gameConnectionState} rtc={rtcState} ai={snapshot.aiConnectionState} camera={cameraState} /></header>
    <button type="button" className={styles.battleLeaveButton} onClick={() => void forfeitAndLeave()} disabled={resultBusy}>나가기</button>
    <div className={styles.duelLayout}>
      <section className={styles.duelStage} aria-label="공유 목표 1대1 게임판">
        <div className={styles.duelBoards}>
          <BattleBoardPanel title={user.userId || localPlayerLabel} dropBurst={claimedSymbol?.winnerPlayerId === user.userId ? claimedSymbol : null} towerHeightRatio={towerHeights.local} toolbar={<div className={styles.boardStats}><span>콤보 <strong>{snapshot.combo}</strong></span></div>} rendererConfig={{ dangerLineY: BATTLE_DANGER_LINE_Y, dangerLineRatio: BATTLE_DANGER_LINE_RATIO, showScenery: false }} onRendererReady={(renderer, viewport) => { localViewportRef.current = viewport; setLocalRenderer(renderer); localRuntimeRef.current?.resize(viewport.width, viewport.height); }} onViewportResize={(viewport) => { localViewportRef.current = viewport; localRuntimeRef.current?.resize(viewport.width, viewport.height); }} />
          <BattleBoardPanel className={styles.remoteBoardPanel} title={opponent?.displayName ?? remotePlayerLabel} dropBurst={claimedSymbol && claimedSymbol.winnerPlayerId !== user.userId ? claimedSymbol : null} towerHeightRatio={towerHeights.remote} rendererConfig={{ dangerLineY: BATTLE_DANGER_LINE_Y, dangerLineRatio: BATTLE_DANGER_LINE_RATIO, showScenery: false }} onRendererReady={(renderer, viewport) => { remoteViewportRef.current = viewport; setRemoteRenderer(renderer); replica.resize(viewport.width, viewport.height); }} onViewportResize={(viewport) => { remoteViewportRef.current = viewport; replica.resize(viewport.width, viewport.height); }} />
        </div>
        <div className={styles.sharedBattleSky} aria-hidden="true">
          <i className={styles.sharedNightSky}/><i className={[styles.sharedCelestial, styles.sharedSun].join(" ")}/><i className={[styles.sharedCelestial, styles.sharedMoon].join(" ")}/><i className={styles.sharedShootingStar}/>
          <i className={[styles.sharedCloud, styles.sharedCloudOne].join(" ")}/><i className={[styles.sharedCloud, styles.sharedCloudTwo].join(" ")}/><i className={[styles.sharedCloud, styles.sharedCloudThree].join(" ")}/>
          <i className={styles.sharedHills}/><span className={styles.sharedFireflies}><i/><i/><i/><i/><i/></span>
        </div>
        {showSharedTarget ? <div className={[styles.sharedTargetOtter, claimedSymbol ? styles.isDraining : ""].filter(Boolean).join(" ")} aria-label={`공유 목표 ${claimedSymbol?.symbol ?? snapshot.targetSymbol ?? "대기 중"}`}>
          <img src={letterOtter} alt="" draggable={false} />
          <strong key={claimedSymbol?.id ?? snapshot.targetSymbol ?? "waiting"}>{claimedSymbol?.symbol ?? snapshot.targetSymbol ?? "·"}</strong>
          {claimedSymbol ? <span key={`portal-${claimedSymbol.id}`} className={styles.paperBlackHole} aria-hidden="true"><i/><i/></span> : null}
          <span className={styles.sharedTargetHint}>먼저 맞히면 내 보드에 떨어져요!</span>
        </div> : null}
      </section>
      <aside className={styles.duelCameraRail} aria-label="플레이어 카메라">
        <section className={styles.duelCameraCard} aria-label={`${user.displayName} 카메라`}>
          <header><div><strong>{user.userId} CAM</strong></div><em className={cameraState === "CONNECTED" ? styles.recordingIndicator : undefined}>{cameraState === "CONNECTED" ? "REC" : "WAIT"}</em></header>
          <div className={styles.duelCameraViewport}>{localStream ? <HandCamera compact sharedStream={localStream} autoStart rateConfig={RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG} performanceMonitor={recognizer.getPerformanceMonitor()} temporalDecoder={recognizer.getTemporalDecoder()} activePlayerSession={activePlayerSession} onLandmarkFrame={(frame) => recognizer.sendLandmarkFrame(frame)} onHandNotDetected={(capturedAt) => recognizer.notifyHandNotDetected(capturedAt)} prediction={snapshot.prediction} connectionState={recognizer.getConnectionState()} /> : <GameVideoTile kind="LOCAL" label="내 영상" stream={null} cameraEnabled={false} connectionState="DISCONNECTED" />}
            <div className={styles.recognitionBadge}><span>현재 인식</span><strong>{snapshot.prediction?.symbol ?? "-"}</strong><small>{snapshot.prediction ? `${Math.round(snapshot.prediction.confidence * 100)}%` : "대기"}</small></div>
          </div>
        </section>
        <section className={styles.duelCameraCard} aria-label={`${opponent?.displayName ?? "상대"} 카메라`}>
          <header><div><strong>{opponent?.displayName ?? "상대"} CAM</strong></div><em className={opponent?.cameraEnabled ? styles.recordingIndicator : undefined}>{opponent?.cameraEnabled ? "REC" : "WAIT"}</em></header>
          <div className={styles.duelCameraViewport}><GameVideoTile kind="REMOTE" label={opponent?.displayName ?? "상대 영상"} stream={opponent?.stream ?? null} cameraEnabled={opponent?.cameraEnabled ?? false} connectionState={opponent?.connectionState ?? rtcState} /></div>
        </section>
      </aside>
    </div>
    {snapshot.state === "COUNTDOWN" ? <div className={styles.countdown}>{Math.max(1, Math.ceil(snapshot.countdownMs / 1000))}</div> : null}
    <BattleResultModal result={snapshot.result} playerId={user.userId} busy={resultBusy} readyForRematch={resultRecorded} error={resultError} onReturnToWaiting={() => void returnToWaiting()} onRoomList={() => void leaveBattle("/game/battle")} onModeSelect={() => void leaveBattle("/game")} />
  </main>;
}
