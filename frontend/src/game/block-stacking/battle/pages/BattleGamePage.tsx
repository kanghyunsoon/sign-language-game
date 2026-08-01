import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
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
import type { IdleRemovalTarget, MatchFinishedEvent } from "../transport/battleTransportTypes";
import { BattleController } from "../core/BattleController";
import { BattleExitCoordinator } from "../core/BattleExitCoordinator";
import { BattleLocalBoardRuntime } from "../core/BattleLocalBoardRuntime";
import { BATTLE_DANGER_LINE_RATIO, BATTLE_DANGER_LINE_Y, BATTLE_LETTER_SIZE, DEFAULT_BATTLE_RUNTIME_CONFIG } from "../core/BattleRuntimeConfig";
import { DefaultBattleAttackEffect } from "../attack/DefaultBattleAttackEffect";
import { RemoteBoardReplica } from "../sync/RemoteBoardReplica";
import { RemoteBoardRenderer } from "../render/RemoteBoardRenderer";
import { LocalBoardPublisher } from "../sync/LocalBoardPublisher";
import { BattleBoardPanel } from "../components/BattleBoardPanel";
import { settledTowerHeightRatio } from "../../runtime/towerHeight";
import { BattleConnectionPanel } from "../components/BattleConnectionPanel";
import { BattleResultModal } from "../components/BattleResultModal";
import letterOtter from "../../assets/solo-letter-otter.png";
import startTitle from "../../assets/solo-start-title.png";
import styles from "../battle.module.css";
import { createDevAuthHeaders } from "../../../app/devAuthHeaders";
import { BattleResultClient, BattleResultRequestError } from "../../../results/BattleResultClient";
import { submitBattleResult } from "../../../results/BattleResultSubmission";
import { BattleRoomRecoveryCancelledError, isMissingOrForbiddenRoom, recoverBattleRoom } from "../core/BattleRoomRecovery";

const INITIAL: BattleControllerSnapshot = { state: "IDLE", gameConnectionState: "DISCONNECTED", aiConnectionState: "DISCONNECTED", countdownMs: 0, reconnectDeadlineAt: null, score: 0, combo: 0, maxCombo: 0, removedCount: 0, targetSymbol: null, prediction: null, message: "Waiting for board initialization.", result: null };
const BATTLE_CANVAS_WIDTH = 1680;
const BATTLE_CANVAS_HEIGHT = 945;
const BATTLE_HAND_DETECTION_CONFIG = Object.freeze({
  maximumDetectedHands: 1,
  minimumHandDetectionConfidence: .5,
  minimumHandPresenceConfidence: .5,
  minimumTrackingConfidence: .5,
});
// The landmark canvas is a cheap, presentation-only 2D pass. Draw it at
// 30 FPS while keeping hand detection and AI submission latest-only, so the
// skeleton feels immediate without increasing inference or WebSocket traffic.
const BATTLE_RECOGNITION_RATE_CONFIG = Object.freeze({
  ...RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG,
  renderFps: 30,
});

export function BattleGamePage() {
  const { roomId = "" } = useParams(); const navigate = useNavigate();
  const { user, accessToken, config, services, battleMediaSession, sharedCameraSession, activePlayerSession, battleRoomSession, setBattleRoomSession } = useGameModuleContext();
  const transport = useMemo(() => services.battleGameTransportFactory.create(roomId), [roomId, services]);
  const resultClient = useMemo(() => new BattleResultClient({ apiBaseUrl: config.roomApiBaseUrl, userId: user.userId, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : createDevAuthHeaders(user) }), [accessToken, config.roomApiBaseUrl, user]);
  const recognizer = useMemo(() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl, aiInferenceFps: BATTLE_RECOGNITION_RATE_CONFIG.aiInferenceFps, decoderConfig: RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG }), [config.aiWebSocketUrl]);
  const replica = useMemo(() => new RemoteBoardReplica(DEFAULT_BATTLE_RUNTIME_CONFIG.sync), []);
  const exitCoordinator = useMemo(() => new BattleExitCoordinator({ roomGateway: services.battleRoomGateway, mediaSession: battleMediaSession, cameraSession: sharedCameraSession, clearRoomSession: () => setBattleRoomSession(null), navigate: (destination) => navigate(destination, { replace: true }), shouldLeaveRemotely: () => battleRoomSession?.roomId === roomId }), [battleMediaSession, battleRoomSession?.roomId, navigate, roomId, services.battleRoomGateway, setBattleRoomSession, sharedCameraSession]);
  const [snapshot, setSnapshot] = useState(INITIAL); const [participants, setParticipants] = useState<readonly RemoteGameParticipant[]>(() => battleMediaSession.getRemoteParticipants());
  const [resultBusy, setResultBusy] = useState(false); const [resultError, setResultError] = useState<string | null>(null);
  const [resultRecorded, setResultRecorded] = useState(false);
  // A finished result is terminal for this page. Keep it outside the
  // controller lifecycle so a media reconnect or room-cache refresh cannot
  // briefly recreate a controller and make the modal disappear.
  const [finalResult, setFinalResult] = useState<MatchFinishedEvent | null>(null);
  const [claimedSymbol, setClaimedSymbol] = useState<{ readonly id: number; readonly symbol: string; readonly winnerPlayerId: string } | null>(null);
  const [drainingSymbol, setDrainingSymbol] = useState<{ readonly id: number; readonly symbol: string } | null>(null);
  const [idleRemoval, setIdleRemoval] = useState<{ readonly id: string; readonly targets: readonly IdleRemovalTarget[] } | null>(null);
  const claimEffectTimerRef = useRef<number | null>(null);
  const drainEffectTimerRef = useRef<number | null>(null);
  // Keep this latched after the first successful RTC connection. A peer's
  // refresh closes the channel briefly, but must not unmount the running
  // controller (and therefore must not reset the remaining player's board).
  const [mediaReady, setMediaReady] = useState(() => battleMediaSession.getConnectionState() === "CONNECTED");
  const [cameraState, setCameraState] = useState<"CONNECTED" | "DISCONNECTED">(() => sharedCameraSession.getVideoTrack()?.readyState === "live" ? "CONNECTED" : "DISCONNECTED");
  const [rtcState, setRtcState] = useState(() => battleMediaSession.getConnectionState()); const [localRenderer, setLocalRenderer] = useState<GameRenderer | null>(null); const [remoteRenderer, setRemoteRenderer] = useState<GameRenderer | null>(null);
  const resultReportedRef = useRef(false);
  const resultRecordedRef = useRef(false);
  const finalResultRef = useRef<MatchFinishedEvent | null>(null);
  const resultReportPromiseRef = useRef<Promise<void> | null>(null);
  const exitInFlightRef = useRef(false);
  const forfeitAndLeaveRef = useRef<() => Promise<void>>(async () => undefined);
  const recoveryInFlightRef = useRef(false);
  const recoveredMediaRoomRef = useRef<string | null>(null);
  const controllerRef = useRef<BattleController | null>(null); const localRuntimeRef = useRef<BattleLocalBoardRuntime | null>(null); const localViewportRef = useRef({ width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight }); const remoteViewportRef = useRef({ width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight }); const remoteLoopRef = useRef<number | null>(null);
  const settledTowerHeightsRef = useRef({ local: 0, remote: 0 });
  const [towerHeights, setTowerHeights] = useState({ local: 0, remote: 0 });
  const [pageScale, setPageScale] = useState(1);
  useEffect(() => {
    const updatePageScale = () => {
      setPageScale(Math.min(
        window.innerWidth / BATTLE_CANVAS_WIDTH,
        window.innerHeight / BATTLE_CANVAS_HEIGHT,
      ));
    };
    updatePageScale();
    window.addEventListener("resize", updatePageScale);
    return () => window.removeEventListener("resize", updatePageScale);
  }, []);
  const localIsHost = battleRoomSession?.hostUserId === user.userId;
  const reportMatchResult = useCallback((result: MatchFinishedEvent): Promise<void> => {
    if (!Number.isSafeInteger(Number(roomId))) return Promise.resolve();
    if (resultReportPromiseRef.current) return resultReportPromiseRef.current;
    setResultBusy(true);
    setResultError(null);
    const request = submitBattleResult({
      primary: localIsHost,
      cancelled: () => resultRecordedRef.current,
      report: () => resultClient.reportResult(Number(roomId), result.winnerPlayerId),
    })
      .then((outcome) => {
        if (outcome === "CANCELLED") return;
        // Keep the finished match latched until the player explicitly leaves
        // or requests a rematch. Changing activeMatchId here recreated the
        // controller, hid the result modal and started false reconnect logic.
        resultRecordedRef.current = true;
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
        if (cause instanceof BattleResultRequestError && cause.status === 403) {
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
  }, [battleMediaSession, localIsHost, resultClient, roomId, setBattleRoomSession, sharedCameraSession, transport]);
  const refreshMedia = useCallback(() => {
    const nextState = battleMediaSession.getConnectionState();
    setParticipants(battleMediaSession.getRemoteParticipants());
    setRtcState(nextState);
    if (nextState === "CONNECTED") setMediaReady(true);
  }, [battleMediaSession]);
  useEffect(() => battleMediaSession.subscribe(refreshMedia), [battleMediaSession, refreshMedia]);

  useEffect(() => {
    if (battleMediaSession.getConnectionState() === "CONNECTED") {
      recoveredMediaRoomRef.current = roomId;
      setMediaReady(true);
      return;
    }
    // Reporting a result changes the backend room back to WAITING, which can
    // close signaling/media. That is not a gameplay disconnect and must never
    // navigate away from the already-rendered result.
    if (resultRecordedRef.current || finalResultRef.current || controllerRef.current?.snapshot().result) return;
    if (rtcState === "FAILED") recoveredMediaRoomRef.current = null;
    if (recoveredMediaRoomRef.current === roomId && rtcState !== "FAILED") return;
    if (!battleRoomSession || recoveryInFlightRef.current) return;
    const authoritativeRoomCode = battleRoomSession.roomCode;
    if (!authoritativeRoomCode) {
      setBattleRoomSession(null);
      navigate("/game/battle", { replace: true });
      return;
    }
    let cancelled = false;
    recoveryInFlightRef.current = true;
    void (async () => {
      try {
        const authoritative = await recoverBattleRoom({
          roomCode: authoritativeRoomCode,
          joinRoom: (roomCode) => services.battleRoomGateway.joinRoom(roomCode),
          active: () => !cancelled,
        });
        if (authoritative.roomId !== roomId) {
          throw new Error("Recovered room does not match the current game URL.");
        }
        if (authoritative.status !== "PLAYING") {
          if (!cancelled) {
            setBattleRoomSession(authoritative.status === "FINISHED" ? null : authoritative);
            navigate(authoritative.status === "FINISHED" ? "/game/battle" : `/game/battle/${roomId}`, { replace: true });
          }
          return;
        }
        const stream = await sharedCameraSession.start();
        await battleMediaSession.connect(authoritative, stream);
        recoveredMediaRoomRef.current = roomId;
        // `connect` finishes after signaling and peer setup, not after the
        // RTCPeerConnection/DataChannel is open. Starting the game here races
        // the channel handshake and leaves the controller stuck CONNECTING.
        // The media-session subscription above is the single authority that
        // enables the board once it reports CONNECTED.
        if (!cancelled) {
          setBattleRoomSession(authoritative);
          refreshMedia();
        }
      } catch (cause) {
        if (cancelled || cause instanceof BattleRoomRecoveryCancelledError) return;
        if (isMissingOrForbiddenRoom(cause)) {
          setBattleRoomSession(null);
          navigate("/game/battle", { replace: true });
          return;
        }
        setResultError(cause instanceof Error ? `게임 재연결에 실패했습니다: ${cause.message}` : "게임 재연결에 실패했습니다.");
      } finally {
        recoveryInFlightRef.current = false;
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
    const physics = new MatterPhysicsWorld({
      ...DEFAULT_PHYSICS_CONFIG,
      width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth,
      height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight,
      letterWidth: BATTLE_LETTER_SIZE,
      letterHeight: BATTLE_LETTER_SIZE,
      letterColliderPadding: 1,
      gravityY: 0.48,
      maxFallSpeed: 7,
      friction: 0.14,
      frictionAir: 0.0045,
      restitution: 0.035,
      rotationInertiaScale: 0.68,
      settleDurationMs: 550,
      linearVelocityThreshold: 0.045,
      angularVelocityThreshold: 0.006,
      freezeSettledBodies: true,
    });
    const runtime = new BattleLocalBoardRuntime(physics, localRenderer, DEFAULT_BATTLE_RUNTIME_CONFIG); const attack = new DefaultBattleAttackEffect();
    const controller = new BattleController({ playerId: user.userId, roomId, initialMatchId: battleRoomSession?.activeMatchId ?? undefined, transport, localBoard: runtime, remoteBoard: replica, attackEffect: attack, recognizer, sharedTargetMode: true, onMatchStarted: (matchId) => runtime.setPublisher(new LocalBoardPublisher(transport, DEFAULT_BATTLE_RUNTIME_CONFIG.sync, matchId, user.userId)), onSharedTargetClaimed: (event) => {
      const effect = { id: event.acceptedAt, symbol: event.symbol, winnerPlayerId: event.winnerPlayerId };
      setClaimedSymbol(effect);
      setDrainingSymbol({ id: event.acceptedAt, symbol: event.symbol });
      if (claimEffectTimerRef.current !== null) window.clearTimeout(claimEffectTimerRef.current);
      claimEffectTimerRef.current = window.setTimeout(() => { claimEffectTimerRef.current = null; setClaimedSymbol(null); }, 2_300);
      if (drainEffectTimerRef.current !== null) window.clearTimeout(drainEffectTimerRef.current);
      drainEffectTimerRef.current = window.setTimeout(() => { drainEffectTimerRef.current = null; setDrainingSymbol(null); }, 1_150);
    }, onIdleRemovalSelected: (event) => {
      setIdleRemoval({ id: event.removalId, targets: event.targets });
    }, onIdleRemovalExecuted: (event) => {
      setIdleRemoval((current) => current?.id === event.removalId ? null : current);
    } });
    localRuntimeRef.current = runtime; controllerRef.current = controller; const unsubscribe = controller.subscribe((next) => {
      setSnapshot(next);
      if (next.result && !finalResultRef.current) {
        finalResultRef.current = next.result;
        setFinalResult(next.result);
      }
    });
    void controller.connect({ url: config.gameWebSocketUrl, roomId, playerId: user.userId, accessToken, headers: accessToken ? undefined : createDevAuthHeaders(user), hostPlayerId: battleRoomSession?.hostUserId, playerIds: [...new Set(battleRoomSession?.participants.map((participant) => participant.userId) ?? [user.userId])] });
    // The opponent board is an interpolated view of owner-authoritative
    // transforms. It deliberately does not run another Matter.js simulation.
    const remote = new RemoteBoardRenderer(remoteRenderer, replica);
    const renderRemote = () => {
      remote.render(Date.now());
      remoteLoopRef.current = requestAnimationFrame(renderRemote);
    };
    remoteLoopRef.current = requestAnimationFrame(renderRemote);
    return () => { if (remoteLoopRef.current !== null) cancelAnimationFrame(remoteLoopRef.current); if (claimEffectTimerRef.current !== null) window.clearTimeout(claimEffectTimerRef.current); if (drainEffectTimerRef.current !== null) window.clearTimeout(drainEffectTimerRef.current); remoteLoopRef.current = null; unsubscribe(); controller.dispose(); controllerRef.current = null; localRuntimeRef.current = null; remote.clear(); };
  }, [accessToken, battleRoomSession?.activeMatchId, config.gameWebSocketUrl, localRenderer, mediaReady, recognizer, remoteRenderer, replica, roomId, transport, user]);

  useEffect(() => {
    let frame = 0;
    let lastSampleAt = Number.NEGATIVE_INFINITY;
    const sampleTowerHeights = (at: number) => {
      if (at - lastSampleAt < 100) {
        frame = requestAnimationFrame(sampleTowerHeights);
        return;
      }
      lastSampleAt = at;
      const next = {
        local: settledTowerHeightRatio(settledTowerHeightsRef.current.local, localRuntimeRef.current?.getStates() ?? [], DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight, DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight * BATTLE_DANGER_LINE_RATIO, BATTLE_LETTER_SIZE),
        remote: settledTowerHeightRatio(settledTowerHeightsRef.current.remote, replica.getStates(), DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight, DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight * BATTLE_DANGER_LINE_RATIO, BATTLE_LETTER_SIZE),
      };
      settledTowerHeightsRef.current = next;
      setTowerHeights((current) => Math.abs(current.local - next.local) < .001 && Math.abs(current.remote - next.remote) < .001 ? current : next);
      frame = requestAnimationFrame(sampleTowerHeights);
    };
    frame = requestAnimationFrame(sampleTowerHeights);
    return () => cancelAnimationFrame(frame);
  }, [localRenderer, remoteRenderer, replica]);

  useEffect(() => {
    const result = finalResult;
    if (!result || resultReportedRef.current) return;
    resultReportedRef.current = true;
    void reportMatchResult(result).catch(() => { resultReportedRef.current = false; });
  }, [finalResult, reportMatchResult]);

  useEffect(() => transport.subscribe((message) => {
    if (message.type !== "RESULT_RECORDED") return;
    const result = finalResultRef.current ?? controllerRef.current?.snapshot().result;
    if (result && result.matchId !== message.matchId) return;
    resultRecordedRef.current = true;
    setResultRecorded(true);
  }), [transport]);

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
    if (exitInFlightRef.current) return;
    exitInFlightRef.current = true;
    const forfeited = controllerRef.current?.forfeit() ?? false;
    // Wait for the authoritative host to turn PLAYER_FORFEIT_COMMAND into
    // MATCH_FINISHED. A fixed 80 ms delay loses the result on real networks.
    if (forfeited && controllerRef.current) {
      await waitForMatchResult(controllerRef.current);
    }
    const result = finalResultRef.current ?? controllerRef.current?.snapshot().result;
    if (result) {
      try {
        // reportResult receives the winner. The backend records the other
        // participant as the loser under the documented room-result contract.
        await reportMatchResult(result);
      } catch {
        // Leaving is still terminal. The server-side leave/disconnect path can
        // finish the match even when this browser's explicit report races it.
      }
    }
    await leaveBattle("/game/battle");
  };
  forfeitAndLeaveRef.current = forfeitAndLeave;
  useEffect(() => {
    const guardedState = { ...(window.history.state ?? {}), battleForfeitGuard: roomId };
    // Keep one same-URL entry in front of the actual game entry. Browser Back
    // first lands here, so the controller remains mounted until forfeiture and
    // the result request have completed.
    window.history.replaceState(guardedState, "", window.location.href);
    window.history.pushState({ ...guardedState, battleForfeitSentinel: true }, "", window.location.href);
    const handleBrowserBack = () => {
      window.history.pushState({ ...guardedState, battleForfeitSentinel: true }, "", window.location.href);
      void forfeitAndLeaveRef.current();
    };
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, [roomId]);
  const localPlayerLabel = localIsHost ? "PLAYER 1" : "PLAYER 2";
  const remotePlayerLabel = localIsHost ? "PLAYER 2" : "PLAYER 1";
  const localIdleRemovalTarget = idleRemoval?.targets.find((target) => target.playerId === user.userId) ?? null;
  const remoteIdleRemovalTarget = idleRemoval?.targets.find((target) => target.playerId !== user.userId) ?? null;
  const showSharedTarget = snapshot.state === "COUNTDOWN" || snapshot.state === "PLAYING" || snapshot.state === "RECONNECTING";
  return <main
    className={`${styles.page} ${styles.battleFixedPage}`}
    data-fixed-battle-game-canvas="true"
    style={{ transform: `translate(-50%, -50%) scale(${pageScale})` }}
  >
    <header className={styles.topbar}>
      <div className={styles.battleTitleGroup}>
        <button type="button" className={styles.battleBackButton} onClick={() => void forfeitAndLeave()} disabled={resultBusy} aria-label="게임방 나가기">
          <ArrowLeft aria-hidden="true" size={20} />
        </button>
        <h1 className={styles.battleHeaderLogo}><img src={startTitle} alt="프링글수" /></h1>
      </div>
      <div className={styles.battleHeaderMeta}>
        <div className={styles.battleModeBadge}>1 VS 1 · FINISH LINE</div>
        <BattleConnectionPanel game={snapshot.gameConnectionState} rtc={rtcState} ai={snapshot.aiConnectionState} camera={cameraState} />
      </div>
    </header>
    <div className={styles.duelLayout}>
      <section className={styles.duelStage} aria-label="공유 목표 1대1 게임판">
        <div className={styles.duelStageHeading}>
          <span>1 VS 1 · SKY LETTER STAGE</span>
          <span>ROOM {roomId || "-"}</span>
        </div>
        <div className={styles.duelBoards}>
          <div className={styles.sharedBattleSky} aria-hidden="true">
            <i className={styles.sharedNightSky}/><i className={[styles.sharedCelestial, styles.sharedSun].join(" ")}/><i className={[styles.sharedCelestial, styles.sharedMoon].join(" ")}/><i className={styles.sharedShootingStar}/>
            <i className={[styles.sharedCloud, styles.sharedCloudOne].join(" ")}/><i className={[styles.sharedCloud, styles.sharedCloudTwo].join(" ")}/><i className={[styles.sharedCloud, styles.sharedCloudThree].join(" ")}/>
            <i className={styles.sharedHills}/><span className={styles.sharedFireflies}><i/><i/><i/><i/><i/></span>
          </div>
          <BattleBoardPanel title={user.userId || localPlayerLabel} dropBurst={claimedSymbol?.winnerPlayerId === user.userId ? claimedSymbol : null} idleRemovalTarget={localIdleRemovalTarget} towerHeightRatio={towerHeights.local} toolbar={<div className={styles.boardStats}><span>콤보 <strong>{snapshot.combo}</strong></span></div>} rendererConfig={{ coordinateWidth: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, coordinateHeight: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight, dangerLineY: BATTLE_DANGER_LINE_Y, dangerLineRatio: BATTLE_DANGER_LINE_RATIO, showScenery: false }} onRendererReady={(renderer, viewport) => { localViewportRef.current = viewport; setLocalRenderer(renderer); }} onViewportResize={(viewport) => { localViewportRef.current = viewport; }} />
          <BattleBoardPanel className={styles.remoteBoardPanel} title={opponent?.displayName ?? remotePlayerLabel} dropBurst={claimedSymbol && claimedSymbol.winnerPlayerId !== user.userId ? claimedSymbol : null} idleRemovalTarget={remoteIdleRemovalTarget} towerHeightRatio={towerHeights.remote} rendererConfig={{ coordinateWidth: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, coordinateHeight: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight, dangerLineY: BATTLE_DANGER_LINE_Y, dangerLineRatio: BATTLE_DANGER_LINE_RATIO, showScenery: false }} onRendererReady={(renderer, viewport) => { remoteViewportRef.current = viewport; setRemoteRenderer(renderer); }} onViewportResize={(viewport) => { remoteViewportRef.current = viewport; }} />
        </div>
        {showSharedTarget ? <div className={[styles.sharedTargetOtter, drainingSymbol ? styles.isDraining : ""].filter(Boolean).join(" ")} aria-label={`공유 목표 ${drainingSymbol?.symbol ?? snapshot.targetSymbol ?? "대기 중"}`}>
          <img src={letterOtter} alt="" draggable={false} />
          <strong key={drainingSymbol?.id ?? snapshot.targetSymbol ?? "waiting"}>{drainingSymbol?.symbol ?? snapshot.targetSymbol ?? "·"}</strong>
          {drainingSymbol ? <span key={`portal-${drainingSymbol.id}`} className={styles.paperBlackHole} aria-hidden="true"><i/><i/></span> : null}
          <span className={styles.sharedTargetHint}>먼저 맞히면 내 보드에 떨어져요!</span>
        </div> : null}
      </section>
      <aside className={styles.duelCameraRail} aria-label="플레이어 카메라">
        <section className={styles.duelCameraCard} aria-label={`${user.displayName} 카메라`}>
          <header><div><strong>{user.userId} CAM</strong></div><em className={cameraState === "CONNECTED" ? styles.recordingIndicator : undefined}>{cameraState === "CONNECTED" ? "REC" : "WAIT"}</em></header>
          <div className={styles.duelCameraViewport}>{localStream ? <HandCamera compact sharedStream={localStream} autoStart renderHandOverlay rateConfig={BATTLE_RECOGNITION_RATE_CONFIG} handDetectionConfig={BATTLE_HAND_DETECTION_CONFIG} performanceMonitor={recognizer.getPerformanceMonitor()} temporalDecoder={recognizer.getTemporalDecoder()} activePlayerSession={activePlayerSession} onLandmarkFrame={(frame) => recognizer.sendLandmarkFrame(frame)} onHandNotDetected={(capturedAt) => recognizer.notifyHandNotDetected(capturedAt)} prediction={snapshot.prediction} connectionState={recognizer.getConnectionState()} /> : <GameVideoTile kind="LOCAL" label="내 영상" stream={null} cameraEnabled={false} connectionState="DISCONNECTED" />}
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
    <BattleResultModal result={finalResult} playerId={user.userId} busy={resultBusy} readyForRematch={resultRecorded} error={resultError} onReturnToWaiting={() => void returnToWaiting()} onRoomList={() => void leaveBattle("/game/battle")} />
  </main>;
}

function waitForMatchResult(controller: BattleController, timeoutMs = 1_500): Promise<void> {
  if (controller.snapshot().result) return Promise.resolve();
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (!controller.snapshot().result && Date.now() - startedAt < timeoutMs) return;
      window.clearInterval(timer);
      resolve();
    }, 25);
  });
}
