import { Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { useSharedCameraOwnerCleanup } from "../../media/camera/useSharedCameraOwnerCleanup";

const INITIAL_SNAPSHOT: GameRuntimeSnapshot = {
  runState: "IDLE",
  score: 0,
  combo: 0,
  bestCombo: 0,
  removedCount: 0,
  playTimeMs: 0,
  activeLetterCount: 0,
  lockedSymbol: null,
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
  const { config, services, sharedCameraSession, activePlayerSession } = useGameModuleContext();
  const resolvedSoloGameApiFactory = useMemo(
    () => soloGameApiFactory ?? (() => services.soloGameApi),
    [services.soloGameApi, soloGameApiFactory],
  );
  const resolvedSignRecognizerFactory = useMemo(
    () => signRecognizerFactory ?? (() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl })),
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
  const [cameraStream,setCameraStream]=useState(()=>sharedCameraSession.getStream());
  const rendererConfig = useMemo(() => ({ dangerLineY: 160, dangerLineRatio: 1 / 6, letterWidth: 140, letterHeight: 140 }), []);
  useSharedCameraOwnerCleanup(sharedCameraSession,()=>activePlayerSession?.clearRegistration());

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
      symbols: GAME_SYMBOLS,
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
    void primeGlyphCollisionCache(GAME_SYMBOLS);
  }, []);

  useEffect(() => recognitionController.subscribe(setRecognition), [recognitionController]);

  useEffect(() => {
    if (snapshot.runState !== "GAME_OVER" || savedGameOverRef.current) return;
    savedGameOverRef.current = true;
    const coordinator = sessionCoordinatorRef.current;
    if (coordinator === null) return;
    setCompletionError(null);
    void coordinator.complete(toCompleteSoloSessionRequest(snapshot, recognition.learningStats, Date.now()))
      .then((result) => setSavedResult(result))
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
  },[activePlayerSession,sharedCameraSession]);

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
    if (recognition.playableSymbols.length === 0) {
      setCompletionError("AI capabilities must load before a solo session can start.");
      return;
    }
    setCompletionError(null);
    setSavedResult(null);
    if (coordinator.getActiveSession() === null) {
      setSessionStarting(true);
      try {
        await coordinator.start({ difficulty: "BEGINNER", symbolRange: recognition.playableSymbols, playMode: "AI" });
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
        <div>
          <p className="eyebrow">한글 수어 학습 게임</p>
          <h1>손말 타자연습</h1>
        </div>
        <div className="solo-controls">
          <button type="button" onClick={startOrResume} disabled={snapshot.runState === "RUNNING" || sessionStarting}>
            <Play aria-hidden="true" size={17} />
            {snapshot.runState === "PAUSED" ? "계속하기" : "게임 시작"}
          </button>
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
          <section className="solo-hud" aria-label="게임 현황">
            <Metric label="점수" value={String(snapshot.score)} />
            <Metric label="콤보" value={String(snapshot.combo)} />
            <Metric label="최고 콤보" value={String(snapshot.bestCombo)} />
            <Metric label="제거" value={String(snapshot.removedCount)} />
            <Metric label="시간" value={formatPlayTime(snapshot.playTimeMs)} />
            <p className="solo-message" aria-live="polite">{snapshot.lastMessage}</p>
            <p
              className={`solo-lock solo-lock-slot${snapshot.lockedSymbol === null ? " is-empty" : ""}`}
              aria-live="polite"
              aria-hidden={snapshot.lockedSymbol === null}
            >
              {snapshot.lockedSymbol === null
                ? "입력 잠금 안내 공간"
                : `같은 글자를 다시 입력하려면 손을 풀어주세요: ${snapshot.lockedSymbol}`}
            </p>
          </section>
          <div className="solo-board-wrap">
          <GameCanvas
            className="solo-board"
            rendererConfig={rendererConfig}
            onRendererReady={createRuntime}
            onViewportResize={resizeRuntime}
            onRendererDisposed={disposeRuntime}
          />
          {snapshot.runState === "GAME_OVER" && (
            <div className="game-over-overlay" role="dialog" aria-modal="true" aria-label="Game over results">
              <p className="eyebrow">Game over</p>
              <strong>{snapshot.score}</strong>
              <span>Best combo {snapshot.bestCombo} · removed {snapshot.removedCount} · {formatPlayTime(snapshot.playTimeMs)}</span>
              <ResultStatistics statistics={recognition.learningStats} />
              <button type="button" onClick={restart}>Restart</button>
            </div>
          )}
          </div>
        </div>

        <aside className="solo-sidebar">
          {cameraStream ? <HandCamera
            sharedStream={cameraStream}
            autoStart
            performanceMonitor={recognizerRef.current?.getPerformanceMonitor()}
            temporalDecoder={recognizerRef.current?.getTemporalDecoder()}
            activePlayerSession={activePlayerSession}
            onLandmarkFrame={sendLandmarkFrame}
            onHandNotDetected={handNotDetected}
            targetSymbol={recognition.targetSymbol}
            prediction={recognition.prediction}
            connectionState={recognition.connectionState}
            modelVersion={recognition.modelVersion}
            connectionError={recognition.error ? `${recognitionErrorTitle(recognition.error.kind)}: ${recognition.error.message}` : null}
            awaitingHandRelease={recognition.awaitingHandRelease}
          /> : <div className="solo-camera-placeholder" role={cameraError?"alert":undefined}>{cameraError??"공유 카메라를 준비하고 있습니다."}</div>}

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

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return <div className="solo-metric"><span>{label}</span><strong>{value}</strong></div>;
}
