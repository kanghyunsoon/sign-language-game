import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import { GameCanvas } from "../components/GameCanvas";
import { DEFAULT_GAME_CONFIG } from "../core/types";
import { primeGlyphCollisionCache } from "../glyphs/glyphRaster";
import { MatterPhysicsWorld } from "../physics/MatterPhysicsWorld";
import { DEFAULT_PHYSICS_CONFIG } from "../physics/types";
import { GameRuntime, type GameRuntimeSnapshot } from "../runtime";
import {
  SoloSessionCoordinator,
  toCompleteSoloSessionRequest,
  type SoloGameApi,
  type SoloGameResult,
} from "../solo/api";
import type { GameRenderer } from "../render/types";
import {
  HandCamera,
  PythonWebSocketSignRecognizer,
  RecognitionGameController,
  type RecognitionGameState,
} from "../../recognition";
import { GAME_SYMBOLS } from "../../recognition/core/symbols";
import { RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG } from "../../recognition/runtime";
import { RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG } from "../../recognition/temporal";
import { useSharedCameraOwnerCleanup } from "../../media/camera/useSharedCameraOwnerCleanup";
import otterWalkFrame0 from "../assets/solo-walking-otter-frame-0.png";
import otterWalkFrame1 from "../assets/solo-walking-otter-frame-1.png";
import otterWalkFrame2 from "../assets/solo-walking-otter-frame-2.png";
import otterWalkFrame3 from "../assets/solo-walking-otter-frame-3.png";
import otterWalkFrame4 from "../assets/solo-walking-otter-frame-4.png";
import resultOtter from "../assets/game-menu-otter.png";
import letterOtter from "../assets/solo-letter-otter.png";

const OTTER_WALK_FRAMES = [
  otterWalkFrame0,
  otterWalkFrame1,
  otterWalkFrame2,
  otterWalkFrame3,
  otterWalkFrame4,
] as const;

// Gameplay prioritises prompt feedback. Frames are still latest-only, so a
// busy AI connection drops stale work instead of making the hand overlay lag.
const SOLO_RECOGNITION_RATE_CONFIG = RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG;
const SOLO_DECODER_CONFIG = RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG;

const INITIAL_SNAPSHOT: GameRuntimeSnapshot = {
  runState: "IDLE",
  score: 0,
  combo: 0,
  bestCombo: 0,
  removedCount: 0,
  playTimeMs: 0,
  activeLetterCount: 0,
  lockedSymbol: null,
  queuedSymbol: null,
  paperBurstVersion: 0,
  paperBurstSymbol: null,
  lastMessage: "Preparing the game board.",
};

const INITIAL_RECOGNITION_STATE: RecognitionGameState = {
  mode: "PYTHON_AI",
  connectionState: "DISCONNECTED",
  supportedSymbols: [],
  playableSymbols: [],
  modelVersion: null,
  targetSymbol: null,
  prediction: null,
  answer: "IDLE",
  awaitingHandRelease: false,
  message: "Preparing recognition input.",
  error: null,
  learningStats: [],
};

export interface SoloGamePageProps {
  readonly soloGameApiFactory?: () => SoloGameApi;
  readonly signRecognizerFactory?: () => PythonWebSocketSignRecognizer;
}

export function SoloGamePage({
  soloGameApiFactory,
  signRecognizerFactory,
}: SoloGamePageProps = {}) {
  const navigate = useNavigate();
  const { config, services, sharedCameraSession } = useGameModuleContext();
  const resolvedSoloGameApiFactory = useMemo(
    () => soloGameApiFactory ?? (() => services.soloGameApi),
    [services.soloGameApi, soloGameApiFactory],
  );
  const resolvedSignRecognizerFactory = useMemo(
    () => signRecognizerFactory ?? (() => new PythonWebSocketSignRecognizer({
      url: config.aiWebSocketUrl,
      aiInferenceFps: SOLO_RECOGNITION_RATE_CONFIG.aiInferenceFps,
      decoderConfig: SOLO_DECODER_CONFIG,
    })),
    [config.aiWebSocketUrl, signRecognizerFactory],
  );
  const runtimeRef = useRef<GameRuntime | null>(null);
  const recognizerRef = useRef<PythonWebSocketSignRecognizer | null>(null);
  const controllerRef = useRef<RecognitionGameController | null>(null);
  const sessionCoordinatorRef = useRef<SoloSessionCoordinator | null>(null);
  const savedGameOverRef = useRef(false);
  const [snapshot, setSnapshot] = useState<GameRuntimeSnapshot>(INITIAL_SNAPSHOT);
  const [recognition, setRecognition] = useState<RecognitionGameState>(INITIAL_RECOGNITION_STATE);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<SoloGameResult | null>(null);
  const [soloRank, setSoloRank] = useState<number | null>(null);
  const [otterWalking, setOtterWalking] = useState(false);
  const [cameraStream,setCameraStream]=useState(()=>sharedCameraSession.getStream());
  const rendererConfig = useMemo(() => ({ dangerLineY: 160, dangerLineRatio: 1 / 6, letterWidth: 140, letterHeight: 140 }), []);
  useSharedCameraOwnerCleanup(sharedCameraSession);

  if (controllerRef.current === null) {
    controllerRef.current = new RecognitionGameController({
      submitSymbol: (symbol) => runtimeRef.current?.submitSymbol(symbol),
      releaseInput: () => runtimeRef.current?.releaseInput(),
      hasAvailableSymbol: (symbol) => runtimeRef.current?.hasAvailableSymbol(symbol) ?? false,
      getPreferredTargetSymbol: (symbols) => runtimeRef.current?.getPreferredTargetSymbol(symbols) ?? null,
      setSpawnSymbols: (symbols) => runtimeRef.current?.setSpawnSymbols(symbols),
      recordIncorrectInput: () => runtimeRef.current?.recordIncorrectInput(),
    });
  }
  const recognitionController = controllerRef.current;
  const paperTargetSymbol = snapshot.queuedSymbol
    ?? runtimeRef.current?.getPreferredTargetSymbol(SOLO_GAME_SYMBOLS)
    ?? recognition.targetSymbol;

  if (sessionCoordinatorRef.current === null) {
    sessionCoordinatorRef.current = new SoloSessionCoordinator(resolvedSoloGameApiFactory());
  }

  const disposeRuntime = useCallback(() => {
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
  }, []);

  const createRuntime = useCallback((renderer: GameRenderer, viewport: { readonly width: number; readonly height: number }) => {
    disposeRuntime();
    const runtime = new GameRuntime({
      renderer,
      symbols: SOLO_GAME_SYMBOLS,
      gameConfig: DEFAULT_GAME_CONFIG,
      physics: () => new MatterPhysicsWorld({
        ...DEFAULT_PHYSICS_CONFIG,
        width: viewport.width,
        height: viewport.height,
        letterWidth: 140,
        letterHeight: 140,
      }),
      soloConfig: {
        boardWidth: viewport.width,
        boardHeight: viewport.height,
        autoDropEnabled: false,
        dangerLineY: 160,
        letterHeight: 140,
      },
    });
    runtimeRef.current = runtime;
    runtime.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
      recognitionController.syncTargetToBoard();
    });
    runtime.setSpawnSymbols(recognitionController.getState().playableSymbols);
  }, [disposeRuntime, recognitionController]);

  useEffect(() => {
    return () => disposeRuntime();
  }, [disposeRuntime]);

  useEffect(() => {
    void primeGlyphCollisionCache(SOLO_GAME_SYMBOLS);
  }, []);

  useEffect(() => recognitionController.subscribe(setRecognition), [recognitionController]);

  useEffect(() => {
    if (snapshot.runState !== "RUNNING") {
      setOtterWalking(false);
      return undefined;
    }

    let finishTimer: number | undefined;
    const triggerWalk = () => {
      setOtterWalking(true);
      window.clearTimeout(finishTimer);
      finishTimer = window.setTimeout(() => setOtterWalking(false), 12_000);
    };
    const startedAt = Date.now();
    let nextWalkTimer: number | undefined;
    const scheduleNextWalk = () => {
      const elapsedMinutes = Math.floor((Date.now() - startedAt) / 60_000);
      const scoreStep = Math.floor((runtimeRef.current?.snapshot().score ?? 0) / 5_000);
      // The interruption becomes noticeably more frequent as the round and
      // score build: 35s initially, then progressively down to 12s.
      const delay = Math.max(12_000, 35_000 - elapsedMinutes * 5_000 - scoreStep * 2_000);
      nextWalkTimer = window.setTimeout(() => {
        triggerWalk();
        scheduleNextWalk();
      }, delay);
    };
    scheduleNextWalk();
    return () => {
      window.clearTimeout(nextWalkTimer);
      window.clearTimeout(finishTimer);
    };
  }, [snapshot.runState]);

  useEffect(() => {
    if (snapshot.runState !== "GAME_OVER" || savedGameOverRef.current) return;
    savedGameOverRef.current = true;
    const coordinator = sessionCoordinatorRef.current;
    if (coordinator === null) return;
    setCompletionError(null);
    void coordinator.complete(toCompleteSoloSessionRequest(snapshot, recognition.learningStats, Date.now()))
      .then(async (result) => {
        setSavedResult(result);
        const results = await coordinator.getResults();
        const rank = [...results]
          .sort((left, right) => right.finalScore - left.finalScore || left.endedAt - right.endedAt)
          .findIndex((item) => item.soloSessionId === result.soloSessionId);
        setSoloRank(rank >= 0 ? rank + 1 : null);
      })
      .catch((error: unknown) => {
        setCompletionError(error instanceof Error ? error.message : "Failed to save the solo result.");
      });
  }, [recognition.learningStats, recognition.mode, snapshot.bestCombo, snapshot.playTimeMs, snapshot.removedCount, snapshot.runState, snapshot.score]);

  useEffect(() => {
    const recognizer = resolvedSignRecognizerFactory();
    recognizerRef.current = recognizer;
    recognitionController.attach(recognizer);
    recognitionController.setMode("PYTHON_AI");
    void recognitionController.connect().catch(() => undefined);
    return () => {
      recognitionController.detach();
      recognizer.disconnect();
      recognizerRef.current = null;
    };
  }, [recognitionController, resolvedSignRecognizerFactory]);

  useEffect(()=>{
    let active=true;
    const start=async()=>{try{let stream:MediaStream;try{stream=await sharedCameraSession.start();}catch(cause){if(!active||!(cause instanceof Error)||cause.message!=="Camera start was cancelled.")throw cause;await Promise.resolve();stream=await sharedCameraSession.start();}if(active){setCameraStream(stream);setCameraError(null);}}catch(cause){if(active)setCameraError(cause instanceof Error?cause.message:"카메라를 시작하지 못했습니다.");}};
    void start();
    return()=>{active=false;};
  },[sharedCameraSession]);

  const startOrResume = useCallback(async () => {
    const runtime = runtimeRef.current;
    const coordinator = sessionCoordinatorRef.current;
    if (runtime === null || coordinator === null || sessionStarting) return;
    const runState = runtime.snapshot().runState;
    if (runState === "PAUSED") {
      runtime.start();
      return;
    }
    if (runState === "GAME_OVER") {
      if (coordinator.hasPendingCompletion()) {
        setCompletionError("Save the previous result before starting another session.");
        return;
      }
      savedGameOverRef.current = false;
      recognitionController.resetSessionStatistics();
      runtime.restart();
    }
    // Local UI work must remain playable while the optional Python AI service
    // is offline. Production still requires the capability contract.
    const sessionSymbols = recognition.playableSymbols.length > 0
      ? recognition.playableSymbols
      : import.meta.env.DEV
        ? SOLO_GAME_SYMBOLS
        : [];
    if (sessionSymbols.length === 0) {
      setCompletionError("AI capabilities must load before a solo session can start.");
      return;
    }
    runtime.setSpawnSymbols(sessionSymbols);
    setCompletionError(null);
    setSavedResult(null);
    if (coordinator.getActiveSession() === null) {
      setSessionStarting(true);
      try {
        await coordinator.start({ difficulty: "BEGINNER", symbolRange: sessionSymbols, playMode: "AI" });
      } catch (error) {
        setCompletionError(error instanceof Error ? error.message : "Failed to start the solo session.");
        return;
      } finally {
        setSessionStarting(false);
      }
    }
    runtime.start();
  }, [recognition.playableSymbols, recognitionController, sessionStarting]);
  const pause = useCallback(() => runtimeRef.current?.pause(), []);
  const leaveGame = useCallback(() => {
    runtimeRef.current?.pause();
    navigate("/game/block");
  }, [navigate]);
  const restart = useCallback(() => {
    if (sessionCoordinatorRef.current?.hasPendingCompletion()) {
      setCompletionError("Retry result saving before restarting.");
      return;
    }
    savedGameOverRef.current = false;
    recognitionController.resetSessionStatistics();
    runtimeRef.current?.restart();
  }, [recognitionController]);
  const retryCompletion = useCallback(() => {
    const coordinator = sessionCoordinatorRef.current;
    if (!coordinator?.hasPendingCompletion()) return;
    setCompletionError(null);
    void coordinator.retryCompletion()
      .then((result) => setSavedResult(result))
      .catch((error: unknown) => setCompletionError(error instanceof Error ? error.message : "Failed to save the solo result."));
  }, []);
  const sendLandmarkFrame = useCallback((frame: Parameters<PythonWebSocketSignRecognizer["sendLandmarkFrame"]>[0]) => {
    if (recognitionController.getState().mode === "PYTHON_AI") recognizerRef.current?.sendLandmarkFrame(frame);
  }, [recognitionController]);
  const handNotDetected = useCallback((capturedAt: number) => {
    if (recognitionController.getState().mode === "PYTHON_AI") recognizerRef.current?.notifyHandNotDetected(capturedAt);
  }, [recognitionController]);
  const resizeRuntime = useCallback((viewport: { readonly width: number; readonly height: number }) => {
    runtimeRef.current?.resizeViewport(viewport.width, viewport.height);
  }, []);

  return (
    <div className="solo-game-page">
      <header className="app-header solo-game-header">
        <div className="solo-title-group">
          <button type="button" className="solo-back-button" onClick={leaveGame} aria-label="게임 모드 선택으로 돌아가기">
            <ArrowLeft aria-hidden="true" size={18} />
          </button>
          <div>
          <p className="eyebrow">SOLO · BLOCK STACK</p>
          <h1 aria-label="지문자 테트리수">지문자 테트리<span aria-hidden="true">수</span></h1>
        </div>
        </div>
        <div className="solo-controls">
          <button type="button" className="secondary" onClick={pause} disabled={snapshot.runState !== "RUNNING"}>
            <Pause aria-hidden="true" size={17} /> 일시정지
          </button>
          <button type="button" className="secondary icon" title="Restart game" aria-label="Restart game" onClick={restart}>
            <RotateCcw aria-hidden="true" size={17} />
          </button>
        </div>
      </header>

      {completionError && (
        <div role="alert" className="solo-session-error">
          <p>{completionError}</p>
          {sessionCoordinatorRef.current?.hasPendingCompletion() && (
            <button type="button" onClick={retryCompletion}>Retry result save</button>
          )}
        </div>
      )}

      <section className="solo-workspace" aria-label="Solo physics game">
        <div className="solo-stage-column">
          <div className="solo-board-wrap">
          <div className="solo-sky-decor" aria-hidden="true">
            <i className="cloud cloud-one" />
            <i className="cloud cloud-two" />
            <i className="cloud cloud-three" />
            <i className="cloud cloud-four" />
            <div className="stage-hills" />
            <div className="stage-glyphs">
              <b>ㄱ</b><b>ㅜ</b><b>ㅎ</b><b>ㄷ</b><b>ㅅ</b>
            </div>
          </div>
          <GameCanvas
            className="solo-board"
            rendererConfig={rendererConfig}
            onRendererReady={createRuntime}
            onViewportResize={resizeRuntime}
            onRendererDisposed={disposeRuntime}
          />
          <div className="solo-board-time" aria-label={`경과 시간 ${formatPlayTime(snapshot.playTimeMs)}`}>
            <span>TIME</span>
            <strong>{formatPlayTime(snapshot.playTimeMs)}</strong>
          </div>
          {(snapshot.runState === "IDLE" || snapshot.runState === "PAUSED") && (
            <div className="solo-start-overlay" aria-label="게임 시작">
              <div>
                <p>SKY LETTER STAGE</p>
                <strong>{snapshot.runState === "PAUSED" ? "계속하기" : "지문자 테트리수"}</strong>
                <span>손모양을 맞춰 떨어지는 지문자 블록을 제거하세요.</span>
                <button type="button" onClick={startOrResume} disabled={sessionStarting}>
                  <Play aria-hidden="true" size={28} />
                  {sessionStarting ? "준비 중" : snapshot.runState === "PAUSED" ? "게임 계속하기" : "게임 시작"}
                </button>
              </div>
            </div>
          )}
          {otterWalking && (
            <div className="solo-otter-walk" aria-hidden="true">
              <span className="solo-otter-body">
                <span className="otter-walk-cycle">
                  {OTTER_WALK_FRAMES.map((src, index) => (
                    <img
                      key={src}
                      className={`otter-walk-frame otter-walk-frame-${index}`}
                      src={src}
                      alt=""
                      draggable={false}
                    />
                  ))}
                </span>
                <span className="otter-front-pose" />
              </span>
            </div>
          )}
          {snapshot.runState === "GAME_OVER" && (
            <div className="game-over-overlay" role="dialog" aria-modal="true" aria-label="Game over results">
              <section className="solo-result-card">
                <img src={resultOtter} alt="수어 연습 수달" />
                <div>
                  <p className="eyebrow">SOLO RESULT</p>
                  <h2>수어 연습 완료!</h2>
                  <strong>{snapshot.score.toLocaleString()}점</strong>
                  <p>최고 콤보 {snapshot.bestCombo} · 제거 {snapshot.removedCount}개 · {formatPlayTime(snapshot.playTimeMs)}</p>
                  <b>{soloRank ? `현재 솔로 랭킹 ${soloRank}위` : savedResult ? "기록 저장 완료" : "기록 저장 중..."}</b>
                </div>
                <button type="button" onClick={restart}>다시 하기</button>
              </section>
            </div>
          )}
          </div>
          {snapshot.runState === "RUNNING" && (
            <div className="solo-letter-otter" aria-hidden="true">
              <img src={letterOtter} alt="" draggable={false} />
              <strong>{snapshot.paperBurstSymbol === null ? paperTargetSymbol ?? "·" : ""}</strong>
              {snapshot.paperBurstSymbol !== null && (
                <span key={snapshot.paperBurstVersion} className="solo-paper-burst">
                  {snapshot.paperBurstSymbol}
                </span>
              )}
            </div>
          )}
        </div>

        <aside className="solo-sidebar">
          <section className="solo-camera-cell" aria-label="플레이어 카메라">
            <header className="solo-panel-heading">
              <span><b>PLAYER CAM</b><small>손을 화면 중앙에 보여주세요</small></span>
              <em className={`solo-ai-chip is-${recognition.connectionState.toLowerCase()}`}>AI · {recognition.connectionState}</em>
            </header>
            <div className="solo-camera-viewport">
              {cameraStream ? <HandCamera
                sharedStream={cameraStream}
                compact
                autoStart
                rateConfig={SOLO_RECOGNITION_RATE_CONFIG}
                performanceMonitor={recognizerRef.current?.getPerformanceMonitor()}
                temporalDecoder={recognizerRef.current?.getTemporalDecoder()}
                onLandmarkFrame={sendLandmarkFrame}
                onHandNotDetected={handNotDetected}
                targetSymbol={recognition.targetSymbol}
                prediction={recognition.prediction}
                connectionState={recognition.connectionState}
                modelVersion={recognition.modelVersion}
                connectionError={recognition.error ? `${recognitionErrorTitle(recognition.error.kind)}: ${recognition.error.message}` : null}
                awaitingHandRelease={recognition.awaitingHandRelease}
              /> : <div className="solo-camera-unavailable" role={cameraError?"alert":undefined}>
                <strong>CAMERA OFFLINE</strong>
                <span>{cameraError??"공유 카메라를 준비하고 있습니다."}</span>
              </div>}
              <div className="solo-camera-current-symbol" aria-live="polite">
                <span>현재 인식</span>
                <strong>{recognition.prediction?.symbol ?? "–"}</strong>
                <small>{recognition.prediction ? `${Math.round(recognition.prediction.confidence * 100)}%` : "인식 대기"}</small>
              </div>
            </div>
          </section>

          {recognition.mode === "KEYBOARD" && <section className="solo-symbol-panel" aria-labelledby="keyboard-input-title">
            <div><p className="eyebrow">Development input</p><h2 id="keyboard-input-title">Submit a symbol</h2></div>
            <p>All 41 symbols are available. Click a symbol, or use a matching keyboard character when your keyboard layout emits it.</p>
          </section>}
        </aside>
      </section>
    </div>
  );
}

function recognitionErrorTitle(kind: NonNullable<RecognitionGameState["error"]>["kind"]): string {
  switch (kind) {
    case "SERVER_UNAVAILABLE": return "Python server is not running";
    case "MODEL_LOAD_FAILED": return "Python model could not load";
    case "PROTOCOL_ERROR": return "Python server response error";
    case "UNKNOWN": return "Python AI error";
  }
}

function ResultStatistics({ statistics }: { readonly statistics: RecognitionGameState["learningStats"] }) {
  const mistakes = [...statistics]
    .filter((stat) => stat.incorrectCount > 0)
    .sort((left, right) => right.incorrectCount - left.incorrectCount || left.symbol.localeCompare(right.symbol))
    .slice(0, 3);
  return (
    <div className="game-result-stats">
      <p>Frequent mistakes: {mistakes.length === 0 ? "None" : mistakes.map((stat) => `${stat.symbol} (${stat.incorrectCount})`).join(", ")}</p>
      <ul>
        {statistics.length === 0 && <li>No AI confirmation statistics yet.</li>}
        {statistics.map((stat) => <li key={stat.symbol}>{stat.symbol}: {(stat.successRate * 100).toFixed(0)}% success, {stat.confirmedCount} confirmed</li>)}
      </ul>
    </div>
  );
}

function formatPlayTime(playTimeMs: number): string {
  const totalSeconds = Math.floor(playTimeMs / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

const SOLO_GAME_SYMBOLS = GAME_SYMBOLS.filter((symbol) => !/^\d+$/.test(symbol));
