import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useGameModuleContext } from "../../../app/GameModuleContext";
import { GameVideoTile } from "../../../media/components/GameVideoTile";
import { useSharedCameraOwnerCleanup } from "../../../media/camera/useSharedCameraOwnerCleanup";
import { HandCamera } from "../../../recognition/mediapipe/HandCamera";
import { SignGuideImage } from "../../../recognition/components/SignGuideImage";
import otterWalkFrame0 from "../../assets/solo-walking-otter-frame-0.webp";
import otterWalkFrame1 from "../../assets/solo-walking-otter-frame-1.webp";
import otterWalkFrame2 from "../../assets/solo-walking-otter-frame-2.webp";
import otterWalkFrame3 from "../../assets/solo-walking-otter-frame-3.webp";
import otterWalkFrame4 from "../../assets/solo-walking-otter-frame-4.webp";
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
import { RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG } from "../../../recognition/runtime";
import { RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG } from "../../../recognition/temporal";
import styles from "../battle.module.css";

const OTTER_WALK_FRAMES = [otterWalkFrame0, otterWalkFrame1, otterWalkFrame2, otterWalkFrame3, otterWalkFrame4] as const;
type OtterZone = "none" | "left" | "right";
type OtterDirection = "left-to-right" | "right-to-left";
type OtterTransfer = { readonly symbol: string; readonly direction: OtterDirection; readonly phase: "carry" | "throw" } | null;

const INITIAL: BattleControllerSnapshot = { state: "IDLE", gameConnectionState: "DISCONNECTED", aiConnectionState: "DISCONNECTED", countdownMs: 0, reconnectDeadlineAt: null, score: 0, combo: 0, opponentCombo: 0, maxCombo: 0, removedCount: 0, targetSymbol: null, prediction: null, message: "게임을 준비하고 있습니다.", result: null };

export function BattleBotPracticePage() {
  const navigate = useNavigate();
  const { user, config, sharedCameraSession } = useGameModuleContext();
  // Include the constructor identity so Vite Fast Refresh cannot preserve an
  // instance created from an older transport implementation.
  const transport = useMemo(() => new LocalBattleBotTransport(), [LocalBattleBotTransport]);
  const recognizer = useMemo(() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl, aiInferenceFps: RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG.aiInferenceFps, decoderConfig: RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG }), [config.aiWebSocketUrl]);
  const replica = useMemo(() => new RemoteBoardReplica(DEFAULT_BATTLE_RUNTIME_CONFIG.sync), []);
  const [snapshot, setSnapshot] = useState(INITIAL);
  const [stream, setStream] = useState(() => sharedCameraSession.getStream());
  const [localRenderer, setLocalRenderer] = useState<GameRenderer | null>(null);
  const [remoteRenderer, setRemoteRenderer] = useState<GameRenderer | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [otterWalking, setOtterWalking] = useState(false);
  const [otterZone, setOtterZone] = useState<OtterZone>("none");
  const [otterDirection, setOtterDirection] = useState<OtterDirection>("left-to-right");
  const [otterTransfer, setOtterTransfer] = useState<OtterTransfer>(null);
  const [opponentTargetSymbol, setOpponentTargetSymbol] = useState<string | null>(null);
  const localRuntimeRef = useRef<BattleLocalBoardRuntime | null>(null);
  const localViewportRef = useRef({ width: DEFAULT_BATTLE_RUNTIME_CONFIG.boardWidth, height: DEFAULT_BATTLE_RUNTIME_CONFIG.boardHeight });
  const remoteLoopRef = useRef<number | null>(null);
  useSharedCameraOwnerCleanup(sharedCameraSession);

  useEffect(() => {
    if (snapshot.state !== "PLAYING") {
      setOtterWalking(false);
      setOtterZone("none");
      setOtterTransfer(null);
      return undefined;
    }
    let pickupTimer: number | undefined;
    let rightZoneTimer: number | undefined;
    let throwTimer: number | undefined;
    let finishTimer: number | undefined;
    const triggerWalk = () => {
      const direction: OtterDirection = Math.random() < 0.5 ? "left-to-right" : "right-to-left";
      let carriedSymbol: string | null = null;
      setOtterDirection(direction);
      setOtterTransfer(null);
      setOtterWalking(true);
      setOtterZone(direction === "left-to-right" ? "left" : "right");
      window.clearTimeout(pickupTimer); window.clearTimeout(rightZoneTimer); window.clearTimeout(throwTimer); window.clearTimeout(finishTimer);
      pickupTimer = window.setTimeout(() => {
        if (direction === "left-to-right") {
          carriedSymbol = localRuntimeRef.current?.takeTargetForOtter() ?? null;
          const nextTarget = localRuntimeRef.current?.getTargetSymbol() ?? null;
          setSnapshot((current) => ({ ...current, targetSymbol: nextTarget }));
        } else {
          const picked = transport.takeBotTargetForOtter();
          carriedSymbol = picked?.symbol ?? null;
          setOpponentTargetSymbol(picked?.nextSymbol ?? null);
        }
        if (carriedSymbol) setOtterTransfer({ symbol: carriedSymbol, direction, phase: "carry" });
      }, 1_450);
      rightZoneTimer = window.setTimeout(() => setOtterZone(direction === "left-to-right" ? "right" : "left"), 6_000);
      throwTimer = window.setTimeout(() => {
        if (!carriedSymbol) return;
        setOtterTransfer({ symbol: carriedSymbol, direction, phase: "throw" });
        if (direction === "left-to-right") {
          transport.injectOtterTargetForBot(carriedSymbol);
          setOpponentTargetSymbol(carriedSymbol);
        } else transport.injectOtterTargetForPlayer(carriedSymbol);
      }, 5_100);
      finishTimer = window.setTimeout(() => { setOtterWalking(false); setOtterZone("none"); setOtterTransfer(null); }, 12_000);
    };
    const startedAt = Date.now();
    let nextWalkTimer: number | undefined;
    const scheduleNextWalk = (delay = 3_000) => {
      nextWalkTimer = window.setTimeout(() => {
        triggerWalk();
        const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60_000);
        scheduleNextWalk(Math.max(20_000, 60_000 - elapsedMinutes * 7_000));
      }, delay);
    };
    scheduleNextWalk();
    return () => { window.clearTimeout(nextWalkTimer); window.clearTimeout(pickupTimer); window.clearTimeout(rightZoneTimer); window.clearTimeout(throwTimer); window.clearTimeout(finishTimer); };
  }, [snapshot.state, transport]);

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
          <div className={styles.practiceCamera}>{stream ? <HandCamera compact sharedStream={stream} autoStart rateConfig={RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG} performanceMonitor={recognizer.getPerformanceMonitor()} temporalDecoder={recognizer.getTemporalDecoder()} onLandmarkFrame={(frame) => recognizer.sendLandmarkFrame(frame)} onHandNotDetected={(at) => recognizer.notifyHandNotDetected(at)} targetSymbol={snapshot.targetSymbol} prediction={snapshot.prediction} connectionState={recognizer.getConnectionState()}/> : <GameVideoTile kind="LOCAL" label="내 카메라" stream={null} cameraEnabled={false} connectionState="DISCONNECTED"/>}</div>
          <section className={[styles.signGuide, otterZone === "left" ? styles.otterPassing : ""].filter(Boolean).join(" ")} aria-label="현재 지정 글자 수어 안내"><span>현재 지정 글자</span><strong>{snapshot.targetSymbol ?? "-"}</strong><div><SignGuideImage symbol={snapshot.targetSymbol} responsive />{otterZone === "left" ? <div className={styles.hintBreak}><strong>수달 통과 중!</strong><small>그림 힌트가 잠시 쉬어요</small></div> : null}</div></section>
        </div>
      </section>
      <section className={styles.practiceColumn} aria-label="봇 플레이 영역">
        <BattleBoardPanel title="연습 봇 게임판" subtitle="BOT" toolbar={<div className={styles.boardStats}><span>지정 <strong>{opponentTargetSymbol ?? "-"}</strong></span><span>자동 경기 중</span><i data-state="CONNECTED"/></div>} rendererConfig={{ letterWidth: BATTLE_LETTER_SIZE, letterHeight: BATTLE_LETTER_SIZE, dangerLineY: BATTLE_DANGER_LINE_Y, dangerLineRatio: BATTLE_DANGER_LINE_RATIO }} onRendererReady={(renderer, viewport) => { setRemoteRenderer(renderer); replica.resize(viewport.width, viewport.height); }} onViewportResize={(viewport) => replica.resize(viewport.width, viewport.height)}/>
        <section className={[styles.botStatus, otterZone === "right" ? styles.botOtterPassing : ""].filter(Boolean).join(" ")} aria-label="봇 게임 상태">
          <div className={styles.botMessage}><i>BOT MODE</i><strong>연습 봇 자동 경기 중</strong><span>봇도 빨간색으로 지정된 블록만 순서대로 제거합니다.</span></div>
          {otterZone === "right" ? <div className={styles.botPassingMessage}><strong>수달 통과 중!</strong><small>봇 진영을 지나가고 있어요</small></div> : null}
        </section>
      </section>
    </div>
    {otterWalking ? <div className={styles.battleOtterWalk} data-direction={otterDirection} aria-hidden="true"><span className={styles.battleOtterBody}><span className={styles.otterWalkCycle}>{OTTER_WALK_FRAMES.map((src, index) => <img key={src} className={index === 0 ? styles.otterWalkFrame0 : index === 1 ? styles.otterWalkFrame1 : index === 2 ? styles.otterWalkFrame2 : index === 3 ? styles.otterWalkFrame3 : styles.otterWalkFrame4} src={src} alt="" draggable={false} />)}</span>{otterTransfer?.phase === "carry" ? <span className={styles.otterCargo}>{otterTransfer.symbol}</span> : null}</span></div> : null}
    {otterTransfer?.phase === "throw" ? <div className={styles.otterThrownLetter} data-direction={otterTransfer.direction} aria-hidden="true">{otterTransfer.symbol}</div> : null}
    {snapshot.state === "COUNTDOWN" ? <div className={styles.countdown}>{Math.max(1, Math.ceil(snapshot.countdownMs / 1000))}</div> : null}
    <BattleResultModal
      result={snapshot.result}
      playerId={user.userId}
      onReturnToWaiting={() => navigate("/game/battle")}
      onRoomList={() => navigate("/game/battle")}
    />
  </main>;
}
