import { ArrowLeft, Bot, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useGameModuleContext } from "../../app/GameModuleContext";
import { PythonWebSocketSignRecognizer } from "../../recognition";
import { COMPETITIVE_RECOGNITION_SYMBOLS } from "../../recognition/readiness/recognitionReadiness";
import { createLocalBotPracticeSession, type LineRaceBotState } from "../bot";
import { LineRaceActionFeedbackBanner, LineRaceAttackHand, LineRaceCameraPanel, LineRaceIncomingObstaclePanel, LineRaceRecognitionStatus } from "../components";
import { LineRaceFeedbackPresenter, obstacleFeedbackForUserView, useLineRaceFeedback } from "../feedback";
import { DEFAULT_LINE_RACE_RUNTIME_CONFIG, isLineRaceMockBotPracticeEnabled, type LineRaceRuntimeSnapshot } from "../core";
import { DefaultLineRaceInputResolver, LineRaceContextualCandidateResolver, LineRaceSignInputController, type LineRaceInputState } from "../recognition";
import type { LocalLineRaceGatewaySnapshot, LocalLineRacePlayerStatistics } from "../transport";
import { LineRaceGameShell } from "./LineRaceGameShell";
import styles from "./LineRaceBotPracticePage.module.css";
import { useSharedCameraOwnerCleanup } from "../../media/camera/useSharedCameraOwnerCleanup";
import { useStrictModeSafeDispose } from "../../shared/useStrictModeSafeDispose";

const EMPTY_INPUT: LineRaceInputState = { connectionState: "DISCONNECTED", prediction: null, confirmedSymbol: null, lockedSymbol: null, lastResolution: null, feedback: { kind: "IDLE", message: "지문자 입력을 기다리고 있습니다." }, error: null };
const EMPTY_GATEWAY: LocalLineRaceGatewaySnapshot = { attackHand: COMPETITIVE_RECOGNITION_SYMBOLS.slice(0, 3), attackCooldownEndsAt: 0, lastConsumedSymbol: null, lastDrawnSymbol: null, lastCommandId: null };

export function LineRaceBotPracticePage() {
  if (!isLineRaceMockBotPracticeEnabled()) return null;
  return <LineRaceBotPracticeDevRuntimePage />;
}

export function LineRaceBotPracticeDevRuntimePage() {
  const { sharedCameraSession, activePlayerSession, config } = useGameModuleContext();
  const [seed, setSeed] = useState(12_345); const [seedDraft, setSeedDraft] = useState("12345"); const [sessionVersion, setSessionVersion] = useState(0);
  const session = useMemo(() => createLocalBotPracticeSession({ seed }), [seed, sessionVersion]);
  const { scenario, userTransport, botTransport, bot } = session;
  const symbols = useMemo(() => scenario.controller.getObstacleTemplates().map((template) => template.symbol), [scenario]);
  const contextualResolver = useMemo(() => new LineRaceContextualCandidateResolver(() => userTransport.getInputContext()), [userTransport]);
  const feedbackPresenter = useMemo(() => new LineRaceFeedbackPresenter({ resultAuthority: "LOCAL" }), [userTransport]);
  const recognizer = useMemo(() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl, predictionSelector: contextualResolver }), [config.aiWebSocketUrl, contextualResolver, sessionVersion]);
  const inputController = useMemo(() => new LineRaceSignInputController({ recognizer, resolver: new DefaultLineRaceInputResolver(), gateway: userTransport,
    getContext: () => userTransport.getInputContext(), onActionFeedback: (event) => feedbackPresenter.dispatch(event) }), [feedbackPresenter, recognizer, userTransport]);
  useStrictModeSafeDispose(session);
  useStrictModeSafeDispose(inputController);
  useStrictModeSafeDispose(feedbackPresenter);
  const [runtime, setRuntime] = useState<LineRaceRuntimeSnapshot>(() => scenario.runtime.getSnapshot());
  const [input, setInput] = useState<LineRaceInputState>(EMPTY_INPUT); const [userGateway, setUserGateway] = useState<LocalLineRaceGatewaySnapshot>(EMPTY_GATEWAY);
  const [botState, setBotState] = useState<LineRaceBotState>(() => bot.getState());
  const [userStats, setUserStats] = useState<LocalLineRacePlayerStatistics>(() => userTransport.getStatistics());
  const [botStats, setBotStats] = useState<LocalLineRacePlayerStatistics>(() => botTransport.getStatistics());
  const [stream, setStream] = useState<MediaStream | null>(null); const [cameraError, setCameraError] = useState<string | null>(null);
  const [registrationReady, setRegistrationReady] = useState(() => !activePlayerSession || activePlayerSession.getSnapshot().state === "LOCKED");
  useSharedCameraOwnerCleanup(sharedCameraSession,()=>activePlayerSession?.clearRegistration());

  useEffect(() => activePlayerSession?.subscribe((snapshot) => {
    if (snapshot.state === "LOCKED") setRegistrationReady(true);
  }), [activePlayerSession]);

  useEffect(() => {
    if (!registrationReady) return;
    scenario.controller.start();
    setRuntime(scenario.controller.getSnapshot());
    setUserStats(userTransport.getStatistics()); setBotStats(botTransport.getStatistics()); setBotState(bot.getState());
    bot.start();
    const unsubscribeBot = bot.subscribe(setBotState);
    const timer = window.setInterval(() => {
      const next = scenario.controller.getSnapshot(); userTransport.syncRuntime(next); botTransport.syncRuntime(next);
      setRuntime(next); setUserStats(userTransport.getStatistics()); setBotStats(botTransport.getStatistics());
      if (next.state === "FINISHED" && bot.getState().running) bot.stop();
    }, 100);
    return () => { window.clearInterval(timer); unsubscribeBot(); };
  }, [bot, botTransport, registrationReady, scenario, session, userTransport]);

  useEffect(() => {
    let active = true; let track: MediaStreamTrack | null = null;
    const onEnded = () => active && setCameraError("카메라 Track이 종료되었습니다.");
    const unsubscribeInput = inputController.subscribe(setInput); const unsubscribeGateway = userTransport.subscribe(setUserGateway);
    void inputController.connect();
    void sharedCameraSession.start().then((media) => { if (!active) return; setStream(media); setCameraError(null); track = media.getVideoTracks()[0] ?? null; track?.addEventListener("ended", onEnded, { once: true }); })
      .catch((cause: unknown) => { if (active) setCameraError(cameraErrorMessage(cause)); });
    return () => { active = false; track?.removeEventListener("ended", onEnded); unsubscribeInput(); unsubscribeGateway(); };
  }, [inputController, sharedCameraSession, userTransport]);

  const restart = () => setSessionVersion((value) => value + 1);
  const applySeed = () => { const value = Number(seedDraft); if (Number.isInteger(value)) { setSeed(value); setSessionVersion((version) => version + 1); } };
  const forceFinish = () => scenario.controller.finishByTime();
  const playerA = runtime.players.find((player) => player.playerId === "PLAYER_A"); const playerB = runtime.players.find((player) => player.playerId === "PLAYER_B");
  const getInputContext = useCallback(() => userTransport.getInputContext(), [userTransport]);
  const getDecoderSnapshot = useCallback(() => recognizer.getTemporalDecoder().getSnapshot(), [recognizer]);
  const userFeedback = useLineRaceFeedback(feedbackPresenter, { input, getContext: getInputContext, getDecoderSnapshot,
    minimumCandidateVotes: recognizer.getTemporalDecoder().getConfig().minimumCandidateVotes,
    aiConnected: input.connectionState === "CONNECTED", gameConnected: true });

  return <main className={styles.page} data-testid="line-race-bot-practice">
    {!registrationReady ? <div className={styles.registrationGate} role="status"><strong>사용자 등록 대기 중</strong><span>카메라에서 사용자 등록이 완료되면 카운트다운이 시작됩니다.</span></div> : null}
    <header className={styles.header}><div><span>Frontend Mock Bot · Seed {seed}</span><h1>지문자 라인 레이스 개발 진단</h1></div><Link to="/game/turn-battle"><ArrowLeft size={17} /> 라인 레이스 로비</Link></header>
    <p role="note"><strong>개발 진단 전용이며 실제 수어 인식 정확도나 게임 성공 검증 수단이 아닙니다.</strong></p>
    <section className={styles.gameLayout}>
      <div><LineRaceGameShell runtime={scenario.runtime} clock={scenario.clock} config={DEFAULT_LINE_RACE_RUNTIME_CONFIG} obstacleFeedback={obstacleFeedbackForUserView(userFeedback)} /><div className={styles.summary}><strong>{runtime.state}</strong><span>남은 시간 {(runtime.remainingMs / 1000).toFixed(1)}초</span><span>나 {playerA?.progress.toFixed(0) ?? 0}</span><span>Bot {playerB?.progress.toFixed(0) ?? 0}</span></div></div>
      <aside className={styles.botPanel}><Bot size={34} /><h2>연습 봇</h2><strong>카메라 없음</strong><p>공격 패: {botState.hand.join(" · ")}</p><p>카운터 확률: {(botState.counterSuccessRate * 100).toFixed(0)}%</p><p>Seed: {botState.seed}</p></aside>
    </section>
    <section className={styles.mediaLayout}>
      <LineRaceCameraPanel stream={stream} input={input} cameraError={cameraError} performanceMonitor={recognizer.getPerformanceMonitor()} temporalDecoder={recognizer.getTemporalDecoder()} activePlayerSession={activePlayerSession} onLandmarkFrame={(frame) => inputController.sendLandmarkFrame(frame)} onHandNotDetected={(at) => inputController.notifyHandNotDetected(at)} />
      <div className={styles.side}><div className={styles.feedbackBanner}><LineRaceActionFeedbackBanner feedback={userFeedback} /></div><LineRaceAttackHand gateway={userGateway} input={input} now={userTransport.getInputContext().now} userFeedback={userFeedback} /><LineRaceIncomingObstaclePanel context={userTransport.getInputContext()} baseSpeedPerSecond={DEFAULT_LINE_RACE_RUNTIME_CONFIG.baseSpeedPerSecond} userFeedback={userFeedback} /><LineRaceRecognitionStatus input={input} symbols={symbols} /></div>
    </section>
    <details className={styles.devPanel}>
      <summary>개발 옵션</summary><div className={styles.devControls} aria-label="Mock Bot 개발 옵션">
      <h2>개발 옵션</h2>
      <button type="button" onClick={() => bot.setAttacksEnabled(!botState.attacksEnabled)}>{botState.attacksEnabled ? "Bot 공격 중지" : "Bot 공격 재개"}</button>
      <button type="button" disabled={runtime.state !== "PLAYING"} onClick={() => void bot.attackNow().catch(() => undefined)}>Bot 공격 즉시 실행</button>
      <button type="button" onClick={() => bot.setCounterSuccessRate(0)}>카운터 성공률 0%</button><button type="button" onClick={() => bot.setCounterSuccessRate(1)}>카운터 성공률 100%</button>
      {[.5, 1, 2].map((scale) => <button type="button" key={scale} onClick={() => scenario.clock.setTimeScale(scale)}>{scale}배</button>)}
      <button type="button" disabled={runtime.state !== "PLAYING"} onClick={() => scenario.controller.addProgress("PLAYER_A", 100)}>사용자 진행도 +100</button><button type="button" disabled={runtime.state !== "PLAYING"} onClick={() => scenario.controller.addProgress("PLAYER_B", 100)}>Bot 진행도 +100</button>
      <button type="button" disabled={runtime.state !== "PLAYING"} onClick={forceFinish}>경기 강제 종료</button>
      <label>Seed <input type="number" value={seedDraft} onChange={(event) => setSeedDraft(event.target.value)} /></label><button type="button" onClick={applySeed}>Seed 적용 및 재시작</button>
      </div>
    </details>
    {runtime.state === "FINISHED" ? <PracticeResult runtime={runtime} user={userStats} bot={botStats} seed={seed} onRetry={restart} /> : null}
  </main>;
}

function PracticeResult({ runtime, user, bot, seed, onRetry }: { readonly runtime: LineRaceRuntimeSnapshot; readonly user: LocalLineRacePlayerStatistics; readonly bot: LocalLineRacePlayerStatistics; readonly seed: number; readonly onRetry: () => void }) {
  const title = runtime.winnerPlayerId === "PLAYER_A" ? "승리" : runtime.winnerPlayerId === "PLAYER_B" ? "패배" : "무승부";
  return <section className={styles.result} role="dialog" aria-label="연습전 결과"><h2>{title}</h2><p>재현 Seed: {seed}</p><div className={styles.resultPlayers}><ResultPlayer title="사용자" stats={user} runtime={runtime} /><ResultPlayer title="연습 봇" stats={bot} runtime={runtime} /></div><div className={styles.resultActions}><button type="button" onClick={onRetry}><RotateCcw size={16} /> 재도전</button><Link to="/game/turn-battle">라인 레이스 로비</Link><Link to="/game">게임 선택</Link></div></section>;
}

function ResultPlayer({ title, stats, runtime }: { readonly title: string; readonly stats: LocalLineRacePlayerStatistics; readonly runtime: LineRaceRuntimeSnapshot }) {
  const player = runtime.players.find((item) => item.playerId === stats.playerId);
  return <article><h3>{title}</h3><ul><li>최종 진행도 {player?.progress.toFixed(1) ?? 0}</li><li>공격 {stats.attacksSucceeded}/{stats.attacksAttempted}</li><li>카운터 {stats.countersSucceeded}/{stats.countersAttempted}</li><li>장애물 통과 {stats.obstaclesTraversed}</li><li>누적 지연 {player?.accumulatedPenaltyMs.toFixed(0) ?? 0}ms</li><li>최대 콤보 {stats.maxCombo}</li><li>평균 인식 {stats.averageRecognitionMs.toFixed(0)}ms</li></ul><p>{stats.symbols.map((item) => `${item.symbol}: 공격 ${item.attacksSucceeded}, 카운터 ${item.countersSucceeded}`).join(" · ") || "symbol 기록 없음"}</p></article>;
}

function cameraErrorMessage(cause: unknown): string { if (typeof cause === "object" && cause !== null && "name" in cause && cause.name === "NotAllowedError") return "카메라 권한이 거절되었습니다."; return cause instanceof Error ? cause.message : "카메라를 시작하지 못했습니다."; }
