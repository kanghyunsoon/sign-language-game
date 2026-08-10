import { Bot, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useGameModuleContext } from "../../app/GameModuleContext";
import { PythonWebSocketSignRecognizer } from "../../recognition";
import { useSharedCameraOwnerCleanup } from "../../media/camera/useSharedCameraOwnerCleanup";
import { useStrictModeSafeDispose } from "../../shared/useStrictModeSafeDispose";
import { LocalGlyphTurnPractice } from "../bot";
import {
  LineRaceAttackHand,
  LineRaceCameraPanel,
  LineRaceIncomingObstaclePanel,
  LineRaceRecognitionStatus,
  GlyphBattleOnboarding,
} from "../components";
import { DEFAULT_LINE_RACE_RUNTIME_CONFIG } from "../core";
import { createDevLineRaceScenario } from "../dev/createDevLineRaceScenario";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";
import { LineRaceFeedbackPresenter, useLineRaceFeedback } from "../feedback";
import { COMPETITIVE_RECOGNITION_SYMBOLS } from "../../recognition/readiness/recognitionReadiness";
import {
  DefaultLineRaceInputResolver,
  LineRaceContextualCandidateResolver,
  LineRaceSignInputController,
  type LineRaceInputState,
} from "../recognition";
import type { LocalLineRaceGatewaySnapshot } from "../transport";
import { LineRaceGameShell } from "./LineRaceGameShell";
import { hasGlyphStrokeDefinition } from "../render/GlyphStrokeRegistry";
import styles from "./LineRaceGamePage.module.css";

const TURN_RUNTIME_CONFIG = {
  ...DEFAULT_LINE_RACE_RUNTIME_CONFIG,
  baseSpeedPerSecond: 0.001,
  matchDurationMs: 600_000,
  countdownMs: 10,
};
const EMPTY_INPUT: LineRaceInputState = {
  connectionState: "DISCONNECTED",
  prediction: null,
  confirmedSymbol: null,
  lockedSymbol: null,
  lastResolution: null,
  feedback: { kind: "IDLE", message: "지문자 입력을 기다리고 있습니다." },
  error: null,
};

export function GlyphTurnBotPracticePage() {
  const { config, sharedCameraSession, activePlayerSession } =
    useGameModuleContext();
  const [version, setVersion] = useState(0);
  const session = useMemo(() => {
    const scenario = createDevLineRaceScenario(TURN_RUNTIME_CONFIG),
      params = new URLSearchParams(window.location.search);
    const mirrorBotChoice =
        import.meta.env.DEV && params.get("mirrorBot") === "1",
      requestedSymbols = import.meta.env.DEV
        ? (params.get("symbols") ?? "")
            .split(",")
            .filter(hasGlyphStrokeDefinition)
        : [],
      practiceSymbols =
        requestedSymbols.length >= 3
          ? requestedSymbols
          : COMPETITIVE_RECOGNITION_SYMBOLS,
      forcedBotSymbol = import.meta.env.DEV
        ? (params.get("botSymbol") ?? undefined)
        : undefined,
      requestedPlanningMs = import.meta.env.DEV
        ? Number(params.get("planningMs"))
        : Number.NaN,
      planningMs =
        Number.isFinite(requestedPlanningMs) && requestedPlanningMs >= 10_000
          ? requestedPlanningMs
          : undefined;
    const duel = new LocalGlyphTurnPractice({
      symbols: practiceSymbols,
      seed: 12_345 + version,
      mirrorBotChoice,
      forcedBotSymbol,
      planningMs,
    });
    return {
      scenario,
      duel,
      dispose: () => {
        duel.dispose();
        scenario.runtime.dispose();
      },
    };
  }, [version]);
  const { scenario, duel } = session;
  const contextualResolver = useMemo(
    () => new LineRaceContextualCandidateResolver(() => duel.getInputContext()),
    [duel],
  );
  const recognizer = useMemo(
    () =>
      new PythonWebSocketSignRecognizer({
        url: config.aiWebSocketUrl,
        predictionSelector: contextualResolver,
      }),
    [config.aiWebSocketUrl, contextualResolver],
  );
  const feedbackPresenter = useMemo(
    () => new LineRaceFeedbackPresenter({ resultAuthority: "LOCAL" }),
    [duel],
  );
  const inputController = useMemo(
    () =>
      new LineRaceSignInputController({
        recognizer,
        resolver: new DefaultLineRaceInputResolver(),
        gateway: duel,
        getContext: () => duel.getInputContext(),
        selectionChargeMs: 520,
        onActionFeedback: (event) => feedbackPresenter.dispatch(event),
      }),
    [duel, feedbackPresenter, recognizer],
  );
  useStrictModeSafeDispose(session);
  useStrictModeSafeDispose(inputController);
  useStrictModeSafeDispose(feedbackPresenter);
  useSharedCameraOwnerCleanup(sharedCameraSession, () =>
    activePlayerSession?.clearRegistration(),
  );
  const [duelView, setDuelView] = useState<GlyphDuelView>(() =>
    duel.getDuelView(),
  );
  const [gateway, setGateway] = useState<LocalLineRaceGatewaySnapshot>(() =>
    duel.getSnapshot(),
  );
  const [input, setInput] = useState(EMPTY_INPUT);
  const [stream, setStream] = useState<MediaStream | null>(() =>
    sharedCameraSession.getStream(),
  );
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    scenario.controller.start();
    const unsubDuel = duel.subscribeDuel(setDuelView),
      unsubGateway = duel.subscribe(setGateway);
    return () => {
      unsubDuel();
      unsubGateway();
    };
  }, [duel, scenario]);
  useEffect(() => {
    let active = true;
    let track: MediaStreamTrack | null = null;
    const onEnded = () =>
      active && setCameraError("카메라 Track이 종료되었습니다.");
    const unsub = inputController.subscribe(setInput);
    void inputController.connect();
    void sharedCameraSession
      .start()
      .then((media) => {
        if (!active) return;
        setStream(media);
        setCameraError(null);
        track = media.getVideoTracks()[0] ?? null;
        track?.addEventListener("ended", onEnded, { once: true });
      })
      .catch((cause: unknown) => {
        if (active)
          setCameraError(
            cause instanceof Error
              ? cause.message
              : "카메라를 시작하지 못했습니다.",
          );
      });
    return () => {
      active = false;
      track?.removeEventListener("ended", onEnded);
      unsub();
    };
  }, [inputController, sharedCameraSession]);
  const getContext = useCallback(() => duel.getInputContext(), [duel]);
  const getDecoder = useCallback(
    () => recognizer.getTemporalDecoder().getSnapshot(),
    [recognizer],
  );
  const userFeedback = useLineRaceFeedback(feedbackPresenter, {
    input,
    getContext,
    getDecoderSnapshot: getDecoder,
    minimumCandidateVotes: recognizer.getTemporalDecoder().getConfig()
      .minimumCandidateVotes,
    aiConnected: input.connectionState === "CONNECTED",
    gameConnected: true,
  });
  const devSelect = useCallback(
    (symbol: string) => {
      if (!import.meta.env.DEV || duel.getDuelView().phase !== "PLANNING")
        return;
      void duel.submitAttack({
        commandId: crypto.randomUUID(),
        symbol,
        recognizedAt: Date.now(),
      });
    },
    [duel],
  );

  return (
    <main
      className={styles.page}
      data-testid="glyph-turn-bot-practice"
      data-line-race-game="true"
    >
      <header className={styles.header}>
        <div>
          <small>프런트 로컬 · 동시 비공개 선택</small>
          <h1>수달 턴 배틀</h1>
        </div>
        <div className={styles.headerTools}>
          <span>
            <Bot size={16} /> 연습 봇
          </span>
          <GlyphBattleOnboarding />
          <Link to="/game/turn-battle">로비</Link>
        </div>
      </header>
      <section className={styles.layout}>
        <div className={`${styles.panel} ${styles.canvas}`}>
          <LineRaceGameShell
            runtime={scenario.runtime}
            clock={scenario.clock}
            config={TURN_RUNTIME_CONFIG}
            duelView={duelView}
          />
        </div>
      </section>
      <section className={styles.media}>
        <LineRaceCameraPanel
          stream={stream}
          input={input}
          cameraError={cameraError}
          performanceMonitor={recognizer.getPerformanceMonitor()}
          temporalDecoder={recognizer.getTemporalDecoder()}
          activePlayerSession={activePlayerSession}
          onLandmarkFrame={(frame) => inputController.sendLandmarkFrame(frame)}
          onHandNotDetected={(at) => inputController.notifyHandNotDetected(at)}
        />
        <div className={styles.side}>
          <LineRaceAttackHand
            gateway={gateway}
            input={input}
            now={duel.getInputContext().now}
            userFeedback={userFeedback}
            duelView={duelView}
            onDevSelect={devSelect}
          />
          <LineRaceRecognitionStatus
            input={input}
            symbols={COMPETITIVE_RECOGNITION_SYMBOLS}
          />
        </div>
      </section>
      {duelView.phase === "FINISHED" ? (
        <section
          className={styles.practiceResult}
          role="dialog"
          aria-label="턴 배틀 결과"
        >
          <h2>{duelView.local.rounds >= 2 ? "승리" : "패배"}</h2>
          <p>
            라운드 {duelView.local.rounds} : {duelView.opponent.rounds}
          </p>
          <button
            type="button"
            onClick={() => setVersion((value) => value + 1)}
          >
            <RotateCcw size={16} /> 다시 대전
          </button>
        </section>
      ) : null}
    </main>
  );
}
