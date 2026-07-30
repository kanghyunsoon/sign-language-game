import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import { GameCanvas } from "../components/GameCanvas";
import { TowerHeightGauge } from "../components/TowerHeightGauge";
import { GlyphCollisionAudit } from "../components/GlyphCollisionAudit";
import { DEFAULT_GAME_CONFIG } from "../core/types";
import { getGlyphCollisionRects, primeGlyphCollisionCache } from "../glyphs/glyphRaster";
import { MatterPhysicsWorld } from "../physics/MatterPhysicsWorld";
import { DEFAULT_PHYSICS_CONFIG } from "../physics/types";
import { GameRuntime, type GameRuntimeSnapshot } from "../runtime";
import {
  SoloSessionCoordinator,
  TetrisWeightApi,
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
import { SignGuideImage } from "../../recognition/components/SignGuideImage";
import { useSharedCameraOwnerCleanup } from "../../media/camera/useSharedCameraOwnerCleanup";
import resultOtter from "../assets/game-menu-otter.png";
import letterOtter from "../assets/solo-letter-otter.png";
import hintCarryFrame0 from "../assets/solo-paper-carry-frame-0.png";
import hintCarryFrame1 from "../assets/solo-paper-carry-frame-1.png";
import hintCarryFrame2 from "../assets/solo-paper-carry-frame-2.png";
import hintCelebrateFrame0 from "../assets/solo-paper-celebrate-frame-0.png";
import hintCelebrateFrame1 from "../assets/solo-paper-celebrate-frame-1.png";
import hintCelebrateFrame2 from "../assets/solo-paper-celebrate-frame-2.png";
import hintCelebrateFrame3 from "../assets/solo-paper-celebrate-frame-3.png";
import hintPaperThrow from "../assets/solo-paper-throw.png";

// Gameplay prioritises prompt feedback. Frames are still latest-only, so a
// busy AI connection drops stale work instead of making the hand overlay lag.
const SOLO_RECOGNITION_RATE_CONFIG = RESPONSIVE_GAMEPLAY_RECOGNITION_RATE_CONFIG;
const SOLO_DECODER_CONFIG = RESPONSIVE_GAMEPLAY_SIGN_DECODER_CONFIG;
const SOLO_CANVAS_WIDTH = 1680;
const SOLO_CANVAS_HEIGHT = 945;
// Large solo blocks shorten the round and make each successful sign visually
// consequential. Renderer, physics, and game-over geometry must always share
// this exact value.
const SOLO_LETTER_SIZE = 220;
const HINT_DELAY_MS = 7_000;
const HINT_WALK_FULL_PATH_MS = 6_600;
const HINT_THROW_DURATION_MS = 1_520;
// The two celebration frames need enough travel time for each planted foot to
// read as a stride. Faster movement makes the sprite look as if it is sliding
// while its feet flicker in place.
const HINT_RUN_FULL_PATH_MS = 1_900;

type HintOtterPhase = "HIDDEN" | "WALKING" | "THROWING" | "RUNNING";
type HintOtterDirection = "LEFT_TO_RIGHT" | "RIGHT_TO_LEFT";

interface HintOtterState {
  readonly phase: HintOtterPhase;
  readonly direction: HintOtterDirection;
  readonly symbol: string | null;
  readonly cycle: number;
}

const INITIAL_HINT_OTTER_STATE: HintOtterState = {
  phase: "HIDDEN",
  direction: "LEFT_TO_RIGHT",
  symbol: null,
  cycle: 0,
};

const INITIAL_SNAPSHOT: GameRuntimeSnapshot = {
  runState: "IDLE",
  score: 0,
  combo: 0,
  bestCombo: 0,
  removedCount: 0,
  playTimeMs: 0,
  activeLetterCount: 0,
  towerHeightRatio: 0,
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
  const { accessToken, config, services, sharedCameraSession } = useGameModuleContext();
  const tetrisWeightApi = useMemo(() => new TetrisWeightApi({
    baseUrl: config.soloApiBaseUrl,
    credentials: "include",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  }), [accessToken, config.soloApiBaseUrl]);
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
  const hintOtterElementRef = useRef<HTMLDivElement | null>(null);
  const hintOtterStateRef = useRef<HintOtterState>(INITIAL_HINT_OTTER_STATE);
  const hintTargetRef = useRef<string | null>(null);
  const hintDelayRemainingRef = useRef(HINT_DELAY_MS);
  const hintTravelProgressRef = useRef(0);
  const hintPhaseElapsedRef = useRef(0);
  const hintRunStateRef = useRef<GameRuntimeSnapshot["runState"]>("IDLE");
  const lastHintTargetRef = useRef<string | null>(null);
  const lastPaperBurstVersionRef = useRef(0);
  const [snapshot, setSnapshot] = useState<GameRuntimeSnapshot>(INITIAL_SNAPSHOT);
  const [recognition, setRecognition] = useState<RecognitionGameState>(INITIAL_RECOGNITION_STATE);
  const [hintOtter, setHintOtter] = useState<HintOtterState>(INITIAL_HINT_OTTER_STATE);
  const [sessionStarting, setSessionStarting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<SoloGameResult | null>(null);
  const [soloRank, setSoloRank] = useState<number | null>(null);
  const [cameraStream,setCameraStream]=useState(()=>sharedCameraSession.getStream());
  const [pageScale, setPageScale] = useState(1);
  const rendererConfig = useMemo(() => ({
    dangerLineY: 160,
    dangerLineRatio: 1 / 6,
    letterWidth: SOLO_LETTER_SIZE,
    letterHeight: SOLO_LETTER_SIZE,
    showScenery: false,
  }), []);
  useSharedCameraOwnerCleanup(sharedCameraSession);

  useEffect(() => {
    const updatePageScale = () => {
      setPageScale(Math.min(
        window.innerWidth / SOLO_CANVAS_WIDTH,
        window.innerHeight / SOLO_CANVAS_HEIGHT,
      ));
    };

    updatePageScale();
    window.addEventListener("resize", updatePageScale);
    return () => window.removeEventListener("resize", updatePageScale);
  }, []);

  // Runtime snapshots are normally published for gameplay events. Poll the
  // runtime clock separately while playing so the visible timer advances even
  // when no letter or recognition event is produced.
  useEffect(() => {
    if (snapshot.runState !== "RUNNING") return undefined;
    const timer = window.setInterval(() => {
      const runtime = runtimeRef.current;
      if (runtime !== null) setSnapshot(runtime.snapshot());
    }, 100);
    return () => window.clearInterval(timer);
  }, [snapshot.runState]);

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
  // The paper owns only the queued/manual target. Once that exact glyph is
  // released into physics the paper must stay empty; falling back to the
  // board's preferred target rendered a second copy behind the falling one.
  const paperTargetSymbol = snapshot.queuedSymbol;

  const updateHintOtterState = useCallback((next: HintOtterState) => {
    hintOtterStateRef.current = next;
    setHintOtter(next);
  }, []);

  const hideHintOtter = useCallback(() => {
    hintTravelProgressRef.current = 0;
    hintPhaseElapsedRef.current = 0;
    hintDelayRemainingRef.current = HINT_DELAY_MS;
    updateHintOtterState({
      ...INITIAL_HINT_OTTER_STATE,
      cycle: hintOtterStateRef.current.cycle,
    });
  }, [updateHintOtterState]);

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
        letterWidth: SOLO_LETTER_SIZE,
        letterHeight: SOLO_LETTER_SIZE,
        // Keep some natural movement, but prevent the pile from spreading across
        // the whole floor before it can build toward the finish line.
        gravityY: 0.32,
        maxFallSpeed: 4.1,
        friction: 0.14,
        frictionAir: 0.0045,
        restitution: 0.035,
        // A letter still reactivates on the next collision, but should count
        // as settled as soon as it visually comes to rest so the tower gauge
        // responds without a multi-second pause.
        settleDurationMs: 550,
        linearVelocityThreshold: 0.045,
        angularVelocityThreshold: 0.006,
        freezeSettledBodies: false,
      }),
      soloConfig: {
        boardWidth: viewport.width,
        boardHeight: viewport.height,
        autoDropEnabled: false,
        dangerLineY: 160,
        letterHeight: SOLO_LETTER_SIZE,
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
    hintRunStateRef.current = snapshot.runState;
    if (
      (snapshot.runState === "IDLE" || snapshot.runState === "GAME_OVER")
      && hintOtterStateRef.current.phase !== "HIDDEN"
    ) {
      hideHintOtter();
    }
  }, [hideHintOtter, snapshot.runState]);

  useEffect(() => {
    hintTargetRef.current = paperTargetSymbol;
    if (lastHintTargetRef.current === paperTargetSymbol) return;
    lastHintTargetRef.current = paperTargetSymbol;
    if (paperTargetSymbol !== null) {
      hintDelayRemainingRef.current = HINT_DELAY_MS;
    }
  }, [paperTargetSymbol]);

  useEffect(() => {
    if (lastPaperBurstVersionRef.current === snapshot.paperBurstVersion) return;
    lastPaperBurstVersionRef.current = snapshot.paperBurstVersion;
    hintDelayRemainingRef.current = HINT_DELAY_MS;

    const currentHint = hintOtterStateRef.current;
    if (
      currentHint.phase !== "WALKING"
      || currentHint.symbol === null
      || snapshot.paperBurstSymbol !== currentHint.symbol
    ) return;

    hintPhaseElapsedRef.current = 0;
    updateHintOtterState({
      ...currentHint,
      phase: "THROWING",
    });
  }, [snapshot.paperBurstSymbol, snapshot.paperBurstVersion, updateHintOtterState]);

  useEffect(() => {
    let animationFrame = 0;
    let previousFrameAt = performance.now();

    const positionHintOtter = () => {
      const element = hintOtterElementRef.current;
      const state = hintOtterStateRef.current;
      if (!element || state.phase === "HIDDEN") return;

      const parentWidth = element.parentElement?.clientWidth ?? 0;
      const otterWidth = element.offsetWidth || 190;
      const startX = -otterWidth * 1.08;
      const endX = parentWidth + otterWidth * 0.08;
      const directedProgress = state.direction === "LEFT_TO_RIGHT"
        ? hintTravelProgressRef.current
        : 1 - hintTravelProgressRef.current;
      const x = startX + (endX - startX) * directedProgress;
      element.style.transform = `translate3d(${x}px, 0, 0)`;
    };

    const startHintWalk = (symbol: string) => {
      hintTravelProgressRef.current = 0;
      hintPhaseElapsedRef.current = 0;
      updateHintOtterState({
        phase: "WALKING",
        direction: Math.random() < 0.5 ? "LEFT_TO_RIGHT" : "RIGHT_TO_LEFT",
        symbol,
        cycle: hintOtterStateRef.current.cycle + 1,
      });
    };

    const step = (frameAt: number) => {
      const deltaMs = Math.min(50, Math.max(0, frameAt - previousFrameAt));
      previousFrameAt = frameAt;
      const state = hintOtterStateRef.current;

      if (hintRunStateRef.current === "RUNNING") {
        if (state.phase === "HIDDEN") {
          const target = hintTargetRef.current;
          if (target !== null) {
            hintDelayRemainingRef.current = Math.max(0, hintDelayRemainingRef.current - deltaMs);
            if (hintDelayRemainingRef.current === 0) startHintWalk(target);
          }
        } else if (state.phase === "WALKING") {
          hintTravelProgressRef.current = Math.min(
            1,
            hintTravelProgressRef.current + deltaMs / HINT_WALK_FULL_PATH_MS,
          );
          if (hintTravelProgressRef.current >= 1) hideHintOtter();
        } else if (state.phase === "THROWING") {
          hintPhaseElapsedRef.current += deltaMs;
          if (hintPhaseElapsedRef.current >= HINT_THROW_DURATION_MS) {
            hintPhaseElapsedRef.current = 0;
            updateHintOtterState({
              ...state,
              phase: "RUNNING",
            });
          }
        } else if (state.phase === "RUNNING") {
          hintTravelProgressRef.current = Math.min(
            1,
            hintTravelProgressRef.current + deltaMs / HINT_RUN_FULL_PATH_MS,
          );
          if (hintTravelProgressRef.current >= 1) hideHintOtter();
        }
      }

      positionHintOtter();
      animationFrame = window.requestAnimationFrame(step);
    };

    animationFrame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [hideHintOtter, updateHintOtterState]);

  useEffect(() => {
    if (snapshot.runState !== "GAME_OVER" || savedGameOverRef.current) return;
    savedGameOverRef.current = true;
    const coordinator = sessionCoordinatorRef.current;
    if (coordinator === null) return;
    setCompletionError(null);
    void coordinator.complete(toCompleteSoloSessionRequest(snapshot, recognition.learningStats, Date.now()))
      .then((result) => {
        setSavedResult(result);
        void coordinator.getRank()
          .then(setSoloRank)
          .catch(() => setSoloRank(null));
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
      recognizerRef.current?.resetRecognitionSession();
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
    // The play clock belongs to the local game runtime, not to the optional
    // session/weight requests.  Start it immediately when the player presses
    // the button so a slow network response cannot delay the visible timer.
    runtime.start();
    setSessionStarting(true);
    const symbolWeightsPromise = accessToken
      ? tetrisWeightApi.getSymbolWeights()
      : Promise.resolve({});
    if (coordinator.getActiveSession() === null) {
      try {
        const [, symbolWeights] = await Promise.all([
          coordinator.start({ difficulty: "BEGINNER", symbolRange: sessionSymbols, playMode: "AI" }),
          symbolWeightsPromise,
        ]);
        runtime.setSymbolWeights(symbolWeights);
      } catch (error) {
        setCompletionError(error instanceof Error ? error.message : "Failed to start the solo session.");
        return;
      } finally {
        setSessionStarting(false);
      }
    } else {
      runtime.setSymbolWeights(await symbolWeightsPromise);
      setSessionStarting(false);
    }
  }, [accessToken, recognition.playableSymbols, recognitionController, sessionStarting, tetrisWeightApi]);
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
    recognizerRef.current?.resetRecognitionSession();
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
    <div
      className="solo-game-page"
      data-fixed-solo-canvas="true"
      style={{ transform: `translate(-50%, -50%) scale(${pageScale})` }}
    >
      {import.meta.env.DEV && new URLSearchParams(window.location.search).has("collisionAudit") && (
        <GlyphCollisionAudit symbols={SOLO_GAME_SYMBOLS} />
      )}
      {import.meta.env.DEV && (
        <output
          hidden
          data-testid="glyph-collider-audit"
          data-audit={JSON.stringify(SOLO_GAME_SYMBOLS.map((symbol) => ({
            symbol,
            parts: getGlyphCollisionRects(symbol).length,
            rectangles: getGlyphCollisionRects(symbol),
          })))}
        />
      )}
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
        <div className={`solo-stage-column${snapshot.runState === "GAME_OVER" ? " is-game-over" : ""}`}>
          <div className="solo-board-wrap">
          <div className="solo-sky-decor" aria-hidden="true">
            <div className="solo-night-sky" />
            <i className="solo-celestial solo-sun" />
            <i className="solo-celestial solo-moon" />
            <i className="solo-shooting-star" />
            <i className="cloud cloud-one" />
            <i className="cloud cloud-two" />
            <i className="cloud cloud-three" />
            <i className="cloud cloud-four" />
            <div className="stage-hills" />
            <div className="solo-fireflies">
              <i /><i /><i /><i /><i />
            </div>
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
          <TowerHeightGauge ratio={snapshot.towerHeightRatio} className="solo-tower-height-gauge" label="STACK" />
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
          {snapshot.runState === "GAME_OVER" && (
            <div className="game-over-overlay" role="dialog" aria-modal="true" aria-label="Game over results">
              <section className="solo-result-card">
                <img src={resultOtter} alt="수어 연습 수달" />
                <div>
                  <p className="eyebrow">SOLO RESULT</p>
                  <h2>수어 연습 완료!</h2>
                  <strong>{formatPlayTime(snapshot.playTimeMs)}</strong>
                  <b>{soloRank ? `현재 솔로 랭킹 ${soloRank}위` : savedResult ? "기록 저장 완료" : "기록 저장 중..."}</b>
                </div>
                <div className="solo-result-actions">
                  <button type="button" onClick={restart}>다시 하기</button>
                  <button type="button" className="is-home" onClick={() => navigate("/game")}>홈으로</button>
                </div>
              </section>
            </div>
          )}
          </div>
          {hintOtter.phase !== "HIDDEN" && hintOtter.symbol !== null && (
            <div
              ref={hintOtterElementRef}
              key={hintOtter.cycle}
              className={`solo-hint-otter is-${hintOtter.phase.toLowerCase()}${snapshot.runState === "PAUSED" ? " is-paused" : ""}`}
              data-direction={hintOtter.direction}
              aria-hidden="true"
            >
              <div className="solo-hint-otter-sprite">
                {hintOtter.phase === "WALKING" && <><img className="solo-hint-frame hint-carry-frame hint-carry-frame-0" src={hintCarryFrame0} alt="" draggable={false} /><img className="solo-hint-frame hint-carry-frame hint-carry-frame-1" src={hintCarryFrame1} alt="" draggable={false} /><div className="solo-hint-paper-guide"><SignGuideImage symbol={hintOtter.symbol} size={58} /></div></>}
                {hintOtter.phase === "THROWING" && <><img className="solo-hint-frame hint-throw-frame hint-throw-carry" src={hintCarryFrame2} alt="" draggable={false} /><img className="solo-hint-frame hint-throw-frame hint-throw-celebrate-0" src={hintCelebrateFrame0} alt="" draggable={false} /><img className="solo-hint-frame hint-throw-frame hint-throw-celebrate-1" src={hintCelebrateFrame1} alt="" draggable={false} /><div className="solo-hint-paper-guide hint-throw-guide"><SignGuideImage symbol={hintOtter.symbol} size={58} /></div><div className="solo-hint-thrown-paper"><img src={hintPaperThrow} alt="" draggable={false} /><span><SignGuideImage symbol={hintOtter.symbol} size={32} /></span></div></>}
                {hintOtter.phase === "RUNNING" && <><img className="solo-hint-frame hint-run-frame hint-run-frame-0" src={hintCelebrateFrame2} alt="" draggable={false} /><img className="solo-hint-frame hint-run-frame hint-run-frame-1" src={hintCelebrateFrame3} alt="" draggable={false} /></>}
              </div>
            </div>
          )}
          {snapshot.runState === "RUNNING" && (
            <div className="solo-letter-otter" aria-hidden="true">
              <img src={letterOtter} alt="" draggable={false} />
              <strong
                key={snapshot.paperBurstVersion}
                className={snapshot.paperBurstSymbol === null ? undefined : "is-releasing"}
              >
                {snapshot.paperBurstSymbol ?? paperTargetSymbol ?? ""}
              </strong>
            </div>
          )}
        </div>

        <aside className="solo-sidebar">
          <section className="solo-camera-cell" aria-label="플레이어 카메라">
            <header className="solo-panel-heading">
              <span><b>PLAYER CAM</b></span>
              <em className={`solo-ai-chip is-${recognition.connectionState.toLowerCase()}`}>AI · {recognition.connectionState}</em>
            </header>
            <div className="solo-camera-viewport">
              {cameraStream ? <HandCamera
                sharedStream={cameraStream}
                compact
                showNoHandPrompt
                hideCompactStatus
                showCompactRecognition
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
