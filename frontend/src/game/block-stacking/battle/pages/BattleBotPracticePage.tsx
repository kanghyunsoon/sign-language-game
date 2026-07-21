import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGameModuleContext } from "../../../app/GameModuleContext";
import { GameVideoTile } from "../../../media/components/GameVideoTile";
import { useSharedCameraOwnerCleanup } from "../../../media/camera/useSharedCameraOwnerCleanup";
import { HandCamera } from "../../../recognition/mediapipe/HandCamera";
import { SignGuideImage } from "../../../recognition/components/SignGuideImage";
import { DEFAULT_PHYSICS_CONFIG } from "../../physics/types";
import { MatterPhysicsWorld } from "../../physics/MatterPhysicsWorld";
import type { GameRenderer } from "../../render/types";
import { DefaultBattleAttackEffect } from "../attack/DefaultBattleAttackEffect";
import { LocalBattleBotTransport } from "../bot/LocalBattleBotTransport";
import { BattleBoardPanel } from "../components/BattleBoardPanel";
import { BattleResultModal } from "../components/BattleResultModal";
import { BattleController, type BattleControllerSnapshot } from "../core/BattleController";
import { BattleLocalBoardRuntime } from "../core/BattleLocalBoardRuntime";
import { BATTLE_DANGER_LINE_RATIO, BATTLE_DANGER_LINE_Y, BATTLE_LETTER_SIZE, DEFAULT_BATTLE_RUNTIME_CONFIG } from "../core/BattleRuntimeConfig";
import { RemoteBoardRenderer } from "../render/RemoteBoardRenderer";
import { RemoteBoardReplica } from "../sync/RemoteBoardReplica";
import { PythonWebSocketSignRecognizer } from "../../../recognition/websocket/PythonWebSocketSignRecognizer";
import styles from "../battle.module.css";

const INITIAL: BattleControllerSnapshot = { state: "IDLE", gameConnectionState: "DISCONNECTED", aiConnectionState: "DISCONNECTED", countdownMs: 0, reconnectDeadlineAt: null, score: 0, combo: 0, maxCombo: 0, removedCount: 0, targetSymbol: null, prediction: null, message: "게임을 준비하고 있습니다.", result: null };

export function BattleBotPracticePage() {
  const navigate = useNavigate();
  const { user, config, sharedCameraSession, activePlayerSession } = useGameModuleContext();
  // Include the constructor identity so Vite Fast Refresh cannot preserve an
  // instance created from an older transport implementation.
  const transport = useMemo(() => new LocalBattleBotTransport(), [LocalBattleBotTransport]);
  const recognizer = useMemo(() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl }), [config.aiWebSocketUrl]);
  const replica = useMemo(() => new RemoteBoardReplica(DEFAULT_BATTLE_RUNTIME_CONFIG.sync), []);
  const [snapshot, setSnapshot] = useState(INITIAL);
  const [stream, setStream] = useState(() => sharedCameraSession.getStream());
  const [localRenderer, setLocalRenderer] = useState<GameRenderer | null>(null);
  const [remoteRenderer, setRemoteRenderer] = useState<GameRenderer | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const localRuntimeRef = useRef<BattleLocalBoardRuntime | null>(null);
  const localViewportRef = useRef({ width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight });
  const remoteLoopRef = useRef<number | null>(null);
  useSharedCameraOwnerCleanup(sharedCameraSession, () => activePlayerSession?.clearRegistration());

  useEffect(() => {
    let active = true;
    if (stream) return () => { active = false; };
    void sharedCameraSession.start().then((next) => { if (active) setStream(next); }).catch((cause) => { if (active) setCameraError(cause instanceof Error ? cause.message : "카메라를 시작하지 못했습니다."); });
    return () => { active = false; };
  }, [sharedCameraSession, stream]);

  useEffect(() => {
    if (!localRenderer || !remoteRenderer) return;
    const physics = new MatterPhysicsWorld({ ...DEFAULT_PHYSICS_CONFIG, width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight, letterWidth: BATTLE_LETTER_SIZE, letterHeight: BATTLE_LETTER_SIZE });
    const runtime = new BattleLocalBoardRuntime(physics, localRenderer, DEFAULT_BATTLE_RUNTIME_CONFIG);
    runtime.resize(localViewportRef.current.width, localViewportRef.current.height);
    const remote = new RemoteBoardRenderer(remoteRenderer, replica);
    const controller = new BattleController({ playerId: user.userId, roomId: "block-bot-practice", transport, localBoard: runtime, remoteBoard: replica, attackEffect: new DefaultBattleAttackEffect(), recognizer });
    localRuntimeRef.current = runtime;
    const unsubscribe = controller.subscribe(setSnapshot);
    void controller.connect({ url: "local://block-bot", roomId: "block-bot-practice", playerId: user.userId });
    const render = () => { remote.render(performance.now()); remoteLoopRef.current = requestAnimationFrame(render); };
    remoteLoopRef.current = requestAnimationFrame(render);
    return () => { if (remoteLoopRef.current !== null) cancelAnimationFrame(remoteLoopRef.current); remoteLoopRef.current = null; unsubscribe(); controller.dispose(); remote.clear(); localRuntimeRef.current = null; };
  }, [localRenderer, recognizer, remoteRenderer, replica, transport, user.userId]);

  return <main className={`${styles.page} ${styles.practicePage}`}>
    <Link className={styles.practiceExit} to="/game/battle">대기방으로</Link>
    {cameraError ? <p className={styles.cameraAlert} role="alert">{cameraError}</p> : null}
    <div className={styles.practiceLayout}>
      <section className={styles.practiceColumn} aria-label="내 플레이 영역">
        <BattleBoardPanel title="내 게임판" subtitle="PLAYER" toolbar={<div className={styles.boardStats}><span>지정 <strong>{snapshot.targetSymbol ?? "-"}</strong></span><span>점수 <strong>{snapshot.score}</strong></span><span>콤보 <strong>{snapshot.combo}</strong></span><i data-state={snapshot.gameConnectionState}/></div>} rendererConfig={{ letterWidth: BATTLE_LETTER_SIZE, letterHeight: BATTLE_LETTER_SIZE, dangerLineY: BATTLE_DANGER_LINE_Y, dangerLineRatio: BATTLE_DANGER_LINE_RATIO }} onRendererReady={(renderer, viewport) => { localViewportRef.current = viewport; setLocalRenderer(renderer); localRuntimeRef.current?.resize(viewport.width, viewport.height); }} onViewportResize={(viewport) => { localViewportRef.current = viewport; localRuntimeRef.current?.resize(viewport.width, viewport.height); }}/>
        <div className={styles.practiceUtility}>
          <div className={styles.practiceCamera}>{stream ? <HandCamera compact sharedStream={stream} autoStart performanceMonitor={recognizer.getPerformanceMonitor()} temporalDecoder={recognizer.getTemporalDecoder()} onLandmarkFrame={(frame) => recognizer.sendLandmarkFrame(frame)} onHandNotDetected={(at) => recognizer.notifyHandNotDetected(at)} targetSymbol={snapshot.targetSymbol} prediction={snapshot.prediction} connectionState={recognizer.getConnectionState()}/> : <GameVideoTile kind="LOCAL" label="내 카메라" stream={null} cameraEnabled={false} connectionState="DISCONNECTED"/>}</div>
          <section className={styles.signGuide} aria-label="현재 지정 글자 수어 안내"><span>현재 지정 글자</span><strong>{snapshot.targetSymbol ?? "-"}</strong><div><SignGuideImage symbol={snapshot.targetSymbol} responsive /></div></section>
        </div>
      </section>
      <section className={styles.practiceColumn} aria-label="봇 플레이 영역">
        <BattleBoardPanel title="연습 봇 게임판" subtitle="BOT" toolbar={<div className={styles.boardStats}><span>자동 경기 중</span><i data-state="CONNECTED"/></div>} rendererConfig={{ letterWidth: BATTLE_LETTER_SIZE, letterHeight: BATTLE_LETTER_SIZE, dangerLineY: BATTLE_DANGER_LINE_Y, dangerLineRatio: BATTLE_DANGER_LINE_RATIO }} onRendererReady={(renderer, viewport) => { setRemoteRenderer(renderer); replica.resize(viewport.width, viewport.height); }} onViewportResize={(viewport) => replica.resize(viewport.width, viewport.height)}/>
        <section className={styles.botStatus}><strong>연습 봇 자동 경기 중</strong><span>봇도 빨간색으로 지정된 블록만 순서대로 제거합니다.</span></section>
      </section>
    </div>
    {snapshot.state === "COUNTDOWN" ? <div className={styles.countdown}>{Math.max(1, Math.ceil(snapshot.countdownMs / 1000))}</div> : null}
    <BattleResultModal
      result={snapshot.result}
      playerId={user.userId}
      onReturnToWaiting={() => navigate("/game/battle")}
      onRoomList={() => navigate("/game/battle")}
      onModeSelect={() => navigate("/game/block")}
    />
  </main>;
}
