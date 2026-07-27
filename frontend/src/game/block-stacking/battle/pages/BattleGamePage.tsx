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
import type { BattleControllerSnapshot } from "../core/BattleController";
import { BattleController } from "../core/BattleController";
import { BattleExitCoordinator } from "../core/BattleExitCoordinator";
import { BattleLocalBoardRuntime } from "../core/BattleLocalBoardRuntime";
import { BATTLE_DANGER_LINE_RATIO, BATTLE_DANGER_LINE_Y, BATTLE_LETTER_SIZE, DEFAULT_BATTLE_RUNTIME_CONFIG } from "../core/BattleRuntimeConfig";
import { DefaultBattleAttackEffect } from "../attack/DefaultBattleAttackEffect";
import { RemoteBoardReplica } from "../sync/RemoteBoardReplica";
import { RemoteBoardRenderer } from "../render/RemoteBoardRenderer";
import { LocalBoardPublisher } from "../sync/LocalBoardPublisher";
import { BattleBoardPanel } from "../components/BattleBoardPanel";
import { BattleConnectionPanel } from "../components/BattleConnectionPanel";
import { BattleHud } from "../components/BattleHud";
import { BattleResultModal } from "../components/BattleResultModal";
import type { OtterTransferEvent } from "../transport/battleTransportTypes";
import otterWalkFrame0 from "../../assets/solo-walking-otter-frame-0.png";
import otterWalkFrame1 from "../../assets/solo-walking-otter-frame-1.png";
import otterWalkFrame2 from "../../assets/solo-walking-otter-frame-2.png";
import otterWalkFrame3 from "../../assets/solo-walking-otter-frame-3.png";
import otterWalkFrame4 from "../../assets/solo-walking-otter-frame-4.png";
import styles from "../battle.module.css";
import { createDevAuthHeaders } from "../../../app/devAuthHeaders";
import { BattleResultClient } from "../../../results/BattleResultClient";

const OTTER_WALK_FRAMES = [otterWalkFrame0, otterWalkFrame1, otterWalkFrame2, otterWalkFrame3, otterWalkFrame4] as const;
type OtterDirection = "left-to-right" | "right-to-left";
type OtterTransfer = { readonly symbol: string; readonly direction: OtterDirection; readonly phase: "carry" | "throw" } | null;

const INITIAL: BattleControllerSnapshot = { state: "IDLE", gameConnectionState: "DISCONNECTED", aiConnectionState: "DISCONNECTED", countdownMs: 0, reconnectDeadlineAt: null, score: 0, combo: 0, maxCombo: 0, removedCount: 0, targetSymbol: null, prediction: null, message: "Waiting for board initialization.", result: null };

export function BattleGamePage() {
  const { roomId = "" } = useParams(); const navigate = useNavigate();
  const { user, accessToken, config, services, battleMediaSession, sharedCameraSession, activePlayerSession, battleRoomSession, setBattleRoomSession } = useGameModuleContext();
  const transport = useMemo(() => services.battleGameTransportFactory.create(roomId), [roomId, services]);
  const resultClient = useMemo(() => new BattleResultClient({ apiBaseUrl: config.roomApiBaseUrl, userId: user.userId, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : createDevAuthHeaders(user) }), [accessToken, config.roomApiBaseUrl, user]);
  const recognizer = useMemo(() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl }), [config.aiWebSocketUrl]);
  const replica = useMemo(() => new RemoteBoardReplica(DEFAULT_BATTLE_RUNTIME_CONFIG.sync), []);
  const exitCoordinator = useMemo(() => new BattleExitCoordinator({ roomGateway: services.battleRoomGateway, mediaSession: battleMediaSession, cameraSession: sharedCameraSession, clearRoomSession: () => setBattleRoomSession(null), navigate: (destination) => navigate(destination, { replace: true }) }), [battleMediaSession, navigate, services.battleRoomGateway, setBattleRoomSession, sharedCameraSession]);
  const [snapshot, setSnapshot] = useState(INITIAL); const [participants, setParticipants] = useState<readonly RemoteGameParticipant[]>(() => battleMediaSession.getRemoteParticipants());
  const [resultBusy, setResultBusy] = useState(false); const [resultError, setResultError] = useState<string | null>(null);
  const [otterWalking, setOtterWalking] = useState(false); const [otterDirection, setOtterDirection] = useState<OtterDirection>("left-to-right"); const [otterTransfer, setOtterTransfer] = useState<OtterTransfer>(null);
  const [cameraState, setCameraState] = useState<"CONNECTED" | "DISCONNECTED">(() => sharedCameraSession.getVideoTrack()?.readyState === "live" ? "CONNECTED" : "DISCONNECTED");
  const [rtcState, setRtcState] = useState(() => battleMediaSession.getConnectionState()); const [localRenderer, setLocalRenderer] = useState<GameRenderer | null>(null); const [remoteRenderer, setRemoteRenderer] = useState<GameRenderer | null>(null);
  const resultReportedRef = useRef(false);
  const otterTimersRef = useRef<number[]>([]);
  const controllerRef = useRef<BattleController | null>(null); const localRuntimeRef = useRef<BattleLocalBoardRuntime | null>(null); const localViewportRef = useRef({ width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight }); const remoteLoopRef = useRef<number | null>(null);
  const refreshMedia = useCallback(() => { setParticipants(battleMediaSession.getRemoteParticipants()); setRtcState(battleMediaSession.getConnectionState()); }, [battleMediaSession]);
  useEffect(() => battleMediaSession.subscribe(refreshMedia), [battleMediaSession, refreshMedia]);
  const showOtterTransfer = useCallback((event: OtterTransferEvent) => {
    for (const timer of otterTimersRef.current) window.clearTimeout(timer);
    otterTimersRef.current = [];
    const pickupDelay = Math.max(0, event.pickupAt - Date.now());
    const throwDelay = Math.max(pickupDelay, event.throwAt - Date.now());
    setOtterDirection(event.direction); setOtterTransfer(null); setOtterWalking(true);
    otterTimersRef.current.push(window.setTimeout(() => {
      if (event.sourcePlayerId === user.userId) localRuntimeRef.current?.takeTargetForOtter();
      setOtterTransfer({ symbol: event.symbol, direction: event.direction, phase: "carry" });
    }, pickupDelay));
    otterTimersRef.current.push(window.setTimeout(() => setOtterTransfer({ symbol: event.symbol, direction: event.direction, phase: "throw" }), throwDelay));
    otterTimersRef.current.push(window.setTimeout(() => { setOtterWalking(false); setOtterTransfer(null); }, throwDelay + 6_900));
  }, [user.userId]);
  useEffect(() => () => { for (const timer of otterTimersRef.current) window.clearTimeout(timer); }, []);

  useEffect(() => { const track = sharedCameraSession.getVideoTrack(); const update = () => setCameraState(track?.readyState === "live" && track.enabled ? "CONNECTED" : "DISCONNECTED"); update(); if (!track) return; track.addEventListener("ended", update); track.addEventListener("mute", update); track.addEventListener("unmute", update); return () => { track.removeEventListener("ended", update); track.removeEventListener("mute", update); track.removeEventListener("unmute", update); }; }, [sharedCameraSession]);

  useEffect(() => {
    if (!localRenderer || !remoteRenderer || !roomId) return;
    const physics = new MatterPhysicsWorld({ ...DEFAULT_PHYSICS_CONFIG, width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight, letterWidth: BATTLE_LETTER_SIZE, letterHeight: BATTLE_LETTER_SIZE });
    const runtime = new BattleLocalBoardRuntime(physics, localRenderer, DEFAULT_BATTLE_RUNTIME_CONFIG); runtime.resize(localViewportRef.current.width, localViewportRef.current.height); const attack = new DefaultBattleAttackEffect();
    const controller = new BattleController({ playerId: user.userId, roomId, initialMatchId: battleRoomSession?.activeMatchId ?? undefined, transport, localBoard: runtime, remoteBoard: replica, attackEffect: attack, recognizer, onMatchStarted: (matchId) => runtime.setPublisher(new LocalBoardPublisher(transport, DEFAULT_BATTLE_RUNTIME_CONFIG.sync, matchId, user.userId)), onOtterTransfer: showOtterTransfer });
    localRuntimeRef.current = runtime; controllerRef.current = controller; const unsubscribe = controller.subscribe(setSnapshot);
    void controller.connect({ url: config.gameWebSocketUrl, roomId, playerId: user.userId, accessToken, headers: accessToken ? undefined : createDevAuthHeaders(user), hostPlayerId: battleRoomSession?.hostUserId, playerIds: [...new Set(battleRoomSession?.participants.map((participant) => participant.userId) ?? [user.userId])] });
    const remote = new RemoteBoardRenderer(remoteRenderer, replica); const renderRemote = () => { remote.render(performance.now()); remoteLoopRef.current = requestAnimationFrame(renderRemote); }; remoteLoopRef.current = requestAnimationFrame(renderRemote);
    return () => { if (remoteLoopRef.current !== null) cancelAnimationFrame(remoteLoopRef.current); remoteLoopRef.current = null; unsubscribe(); controller.dispose(); controllerRef.current = null; localRuntimeRef.current = null; remote.clear(); };
  }, [accessToken, battleRoomSession?.activeMatchId, config.gameWebSocketUrl, localRenderer, recognizer, remoteRenderer, replica, roomId, transport, user]);

  useEffect(() => {
    const result = snapshot.result;
    if (!result || resultReportedRef.current || !Number.isSafeInteger(Number(roomId))) return;
    resultReportedRef.current = true;
    setResultBusy(true);
    setResultError(null);
    void resultClient.reportResult(Number(roomId), result.winnerPlayerId)
      .catch((cause) => setResultError(cause instanceof Error ? cause.message : "결과 전송에 실패했습니다."))
      .finally(() => setResultBusy(false));
  }, [resultClient, roomId, snapshot.result]);

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
  return <main className={`${styles.page} ${styles.battleFixedPage}`}>
    <header className={styles.topbar}><div><h1>1:1 지문자 대전</h1><p>방 {roomId || "-"}</p></div><BattleConnectionPanel game={snapshot.gameConnectionState} rtc={rtcState} ai={snapshot.aiConnectionState} camera={cameraState} /></header>
    <div className={styles.layout}>
      <BattleBoardPanel title="내 게임판" subtitle="SERVER AUTHORITATIVE" rendererConfig={{ dangerLineY: BATTLE_DANGER_LINE_Y, dangerLineRatio: BATTLE_DANGER_LINE_RATIO }} onRendererReady={(renderer, viewport) => { setLocalRenderer(renderer); localRuntimeRef.current?.resize(viewport.width, viewport.height); }} onViewportResize={(viewport) => localRuntimeRef.current?.resize(viewport.width, viewport.height)} />
      <BattleBoardPanel title={opponent ? `${opponent.displayName} 게임판` : "상대 게임판"} subtitle="INTERPOLATED VIEW" rendererConfig={{ dangerLineY: BATTLE_DANGER_LINE_Y, dangerLineRatio: BATTLE_DANGER_LINE_RATIO }} onRendererReady={(renderer, viewport) => { setRemoteRenderer(renderer); replica.resize(viewport.width, viewport.height); }} onViewportResize={(viewport) => replica.resize(viewport.width, viewport.height)} />
      <section className={styles.videos} aria-label="대전 영상"><div className={styles.videoCell}>{localStream ? <HandCamera sharedStream={localStream} autoStart performanceMonitor={recognizer.getPerformanceMonitor()} temporalDecoder={recognizer.getTemporalDecoder()} activePlayerSession={activePlayerSession} onLandmarkFrame={(frame) => recognizer.sendLandmarkFrame(frame)} onHandNotDetected={(capturedAt) => recognizer.notifyHandNotDetected(capturedAt)} prediction={snapshot.prediction} connectionState={recognizer.getConnectionState()} /> : <GameVideoTile kind="LOCAL" label="내 영상" stream={null} cameraEnabled={false} connectionState="DISCONNECTED" />}</div><div className={styles.videoCell}><GameVideoTile kind="REMOTE" label={opponent?.displayName ?? "상대가 퇴장했습니다"} stream={opponent?.stream ?? null} cameraEnabled={opponent?.cameraEnabled ?? false} connectionState={opponent?.connectionState ?? rtcState} /></div></section>
    </div>
    <BattleHud snapshot={snapshot} />
    {otterWalking ? <div className={styles.battleOtterWalk} data-direction={otterDirection} aria-hidden="true"><span className={styles.battleOtterBody}><span className={styles.otterWalkCycle}>{OTTER_WALK_FRAMES.map((src, index) => <img key={src} className={index === 0 ? styles.otterWalkFrame0 : index === 1 ? styles.otterWalkFrame1 : index === 2 ? styles.otterWalkFrame2 : index === 3 ? styles.otterWalkFrame3 : styles.otterWalkFrame4} src={src} alt="" draggable={false} />)}</span>{otterTransfer?.phase === "carry" ? <span className={styles.otterCargo}>{otterTransfer.symbol}</span> : null}</span></div> : null}
    {otterTransfer?.phase === "throw" ? <div className={styles.otterThrownLetter} data-direction={otterTransfer.direction} aria-hidden="true">{otterTransfer.symbol}</div> : null}
    {snapshot.state === "COUNTDOWN" ? <div className={styles.countdown}>{Math.max(1, Math.ceil(snapshot.countdownMs / 1000))}</div> : null}
    <BattleResultModal result={snapshot.result} playerId={user.userId} busy={resultBusy} error={resultError} onReturnToWaiting={() => void returnToWaiting()} onRoomList={() => void leaveBattle("/game/battle")} onModeSelect={() => void leaveBattle("/game")} />
  </main>;
}
