import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useGameModuleContext } from "../../app/GameModuleContext";
import { createDevAuthHeaders } from "../../app/devAuthHeaders";
import { PythonWebSocketSignRecognizer } from "../../recognition";
import { useStrictModeSafeDispose } from "../../shared/useStrictModeSafeDispose";
import { GameVideoTile } from "../../media/components/GameVideoTile";
import { LineRaceGameShell } from "./LineRaceGameShell";
import { LineRaceGameErrorBoundary } from "./LineRaceGameErrorBoundary";
import {
  EstimatedLineRaceServerClock,
  NetworkLineRaceController,
  type NetworkLineRaceView,
} from "../core";
import {
  LineRaceEventDispatcher,
  NetworkLineRaceCommandGateway,
} from "../transport";
import {
  DefaultLineRaceInputResolver,
  LineRaceContextualCandidateResolver,
  LineRaceSignInputController,
  type LineRaceInputState,
} from "../recognition";
import {
  LineRaceAttackHand,
  LineRaceCameraPanel,
  LineRaceRecognitionStatus,
  LineRaceSoundToggle,
  GlyphBattleOnboarding,
} from "../components";
import {
  isLineRacePlaytestTelemetryEnabled,
  LineRaceFeedbackAudio,
  LineRaceFeedbackPresenter,
  LineRacePlaytestTelemetry,
  obstacleFeedbackForUserView,
  useLineRaceFeedback,
  useLineRaceMotionMode,
} from "../feedback";
import { LineRaceConnectionStatus } from "../components/LineRaceConnectionStatus";
import { LineRaceHud } from "../components/LineRaceHud";
import { LineRaceRoomSessionAdapter } from "../session/LineRaceRoomSessionAdapter";
import styles from "./LineRaceGamePage.module.css";
import {
  COMPETITIVE_RECOGNITION_SYMBOLS,
  isCompetitiveRecognitionReady,
} from "../../recognition/readiness/recognitionReadiness";
import { GlyphDuelModel } from "../duel/GlyphDuelModel";
import { GlyphTurnCommandGateway } from "../duel/GlyphTurnCommandGateway";
const EMPTY_INPUT: LineRaceInputState = {
  connectionState: "DISCONNECTED",
  prediction: null,
  confirmedSymbol: null,
  lockedSymbol: null,
  lastResolution: null,
  feedback: { kind: "IDLE", message: "지문자 입력을 기다리고 있습니다." },
  error: null,
};
export function LineRaceGamePage() {
  const params = useParams();
  const navigate = useNavigate();
  const context = useGameModuleContext();
  const {
    user,
    accessToken,
    config,
    sharedCameraSession,
    activePlayerSession,
    lineRaceRoomSession,
    services,
    setLineRaceRoomSession,
  } = context;
  const transport = context.lineRaceTransport;
  const glyphTransport = context.glyphTurnTransport;
  const media = context.lineRaceMediaSession;
  const matchId = params.matchId ?? lineRaceRoomSession?.activeMatchId ?? "";
  if (!transport || !media || !glyphTransport)
    throw new Error("1:1 지문자 턴 배틀 네트워크 세션이 구성되지 않았습니다.");
  const serverClock = useMemo(
    () => new EstimatedLineRaceServerClock(),
    [matchId],
  );
  const controller = useMemo(() => {
    let lastGapSnapshotAt = 0;
    return new NetworkLineRaceController(
      matchId,
      user.userId,
      serverClock,
      () => {
        const now = Date.now();
        if (
          transport.getConnectionState() === "CONNECTED" &&
          now - lastGapSnapshotAt >= 1000
        ) {
          lastGapSnapshotAt = now;
          transport.requestSnapshot(matchId);
        }
      },
      (lineRaceRoomSession?.participants ?? []).map((participant) => ({
        playerId: participant.userId,
        displayName: participant.displayName,
      })),
    );
  }, [
    matchId,
    serverClock,
    transport,
    user.userId,
    lineRaceRoomSession?.participants,
  ]);
  const gateway = useMemo(
    () => new NetworkLineRaceCommandGateway(matchId, transport, controller),
    [controller, matchId, transport],
  );
  const duelModel = useMemo(
    () => new GlyphDuelModel(user.userId),
    [user.userId],
  );
  const glyphCommandGateway = useMemo(
    () => new GlyphTurnCommandGateway(matchId, glyphTransport),
    [glyphTransport, matchId],
  );
  // Browser playtests do not have a real hand-recognition stream.  Keep an
  // explicit development-only card trigger so two browser clients can still
  // exercise the same WebSocket choice command and server resolution path.
  // Production players continue to submit only confirmed hand signs.
  const devTurnSelect =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("devReady") === "1"
      ? (symbol: string) =>
          glyphCommandGateway.choose(symbol, duelModel.getView().turn)
      : undefined;
  const turnGateway = useMemo(
    () => ({
      resultAuthority: "SERVER" as const,
      submitAttack: async (command: {
        commandId: string;
        symbol: string;
        recognizedAt: number;
      }) =>
        glyphCommandGateway.choose(command.symbol, duelModel.getView().turn),
      submitCounter: async () => {
        throw new Error("TURN_MODE_HAS_NO_COUNTER");
      },
      getInputContext: () => gateway.getInputContext(),
      getSnapshot: () => gateway.getSnapshot(),
    }),
    [duelModel, gateway, glyphCommandGateway],
  );
  const feedbackPresenter = useMemo(
    () => new LineRaceFeedbackPresenter({ resultAuthority: "SERVER" }),
    [gateway],
  );
  const audio = useMemo(() => new LineRaceFeedbackAudio(), [matchId]);
  const telemetry = useMemo(
    () =>
      new LineRacePlaytestTelemetry({
        enabled: isLineRacePlaytestTelemetryEnabled(),
        sessionId: matchId,
        botDifficulty: lineRaceRoomSession?.difficulty,
      }),
    [lineRaceRoomSession?.difficulty, matchId],
  );
  const contextualResolver = useMemo(
    () =>
      new LineRaceContextualCandidateResolver(() =>
        turnGateway.getInputContext(),
      ),
    [turnGateway],
  );
  const dispatcher = useMemo(
    () => new LineRaceEventDispatcher(controller),
    [controller],
  );
  const symbols = useMemo(
    () =>
      (
        lineRaceRoomSession?.symbolRange ?? COMPETITIVE_RECOGNITION_SYMBOLS
      ).filter(isCompetitiveRecognitionReady),
    [lineRaceRoomSession?.symbolRange],
  );
  const recognizer = useMemo(
    () =>
      new PythonWebSocketSignRecognizer({
        url: config.aiWebSocketUrl,
        predictionSelector: contextualResolver,
      }),
    [config.aiWebSocketUrl, contextualResolver],
  );
  const inputController = useMemo(
    () =>
      new LineRaceSignInputController({
        recognizer,
        resolver: new DefaultLineRaceInputResolver(),
        gateway: turnGateway,
        getContext: () => turnGateway.getInputContext(),
        selectionChargeMs: 520,
        onActionFeedback: (event) => feedbackPresenter.dispatch(event),
      }),
    [feedbackPresenter, recognizer, turnGateway],
  );
  useStrictModeSafeDispose(controller);
  useStrictModeSafeDispose(inputController);
  useStrictModeSafeDispose(feedbackPresenter);
  useStrictModeSafeDispose(audio);
  useStrictModeSafeDispose(telemetry);
  const [view, setView] = useState<NetworkLineRaceView>(() =>
    controller.getView(),
  );
  const [input, setInput] = useState(EMPTY_INPUT);
  const [stream, setStream] = useState(() => sharedCameraSession.getStream());
  const [gameState, setGameState] = useState(() =>
    transport.getConnectionState(),
  );
  const [rtcState, setRtcState] = useState(() => media.getConnectionState());
  const [remote, setRemote] = useState(
    () => media.getRemoteParticipants()[0] ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [recoveryFailed, setRecoveryFailed] = useState(false);
  const [retryCycle, setRetryCycle] = useState(0);
  const [muted, setMuted] = useState(() => audio.isMuted());
  const [duelView, setDuelView] = useState(() => duelModel.getView());
  const motionMode = useLineRaceMotionMode();
  const hydratingRoom = useRef(false);
  const hydratedRoomId = useRef<string | null>(
    lineRaceRoomSession?.roomId ?? null,
  );
  const roomIdRef = useRef(lineRaceRoomSession?.roomId ?? "");
  const lastFeedbackEffect = useRef<string | undefined>(undefined);
  const finalTenPlayed = useRef(false);
  const reconnectAttempts = useRef(0);
  const resultHandled = useRef(false);
  const hasBotParticipant = Boolean(
    lineRaceRoomSession?.participants.some((participant) => participant.isBot),
  );
  const runtime = useMemo(
    () => ({
      start: () => undefined,
      update: () => controller.tick(),
      pause: () => undefined,
      resume: () => undefined,
      reset: () => undefined,
      finish: () => undefined,
      getSnapshot: () => controller.getView().render,
      subscribe: (
        listener: (snapshot: NetworkLineRaceView["render"]) => void,
      ) => controller.subscribe((next) => listener(next.render)),
      dispose: () => undefined,
    }),
    [controller],
  );
  const connect = useCallback(async () => {
    if (hasBotParticipant)
      throw new Error(
        "온라인 1:1 대전은 사람 대 사람 경기만 지원합니다. 봇전은 연습 모드를 이용해 주세요.",
      );
    controller.connect();
    if (transport.getConnectionState() !== "CONNECTED")
      await transport.connect({
        url: config.gameWebSocketUrl,
        playerId: user.userId,
        roomId: roomIdRef.current,
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : createDevAuthHeaders(user),
      });
    if (reconnectAttempts.current > 0) {
      transport.send({
        type: "LINE_RACE_PLAYER_RECONNECTED",
        commandId: crypto.randomUUID(),
        matchId,
      });
    } else transport.requestSnapshot(matchId);
  }, [
    accessToken,
    config.gameWebSocketUrl,
    controller,
    matchId,
    transport,
    user.userId,
    hasBotParticipant,
  ]);
  useEffect(() => {
    if (!matchId) {
      setError("Match ID가 없습니다.");
      return;
    }
    const unsubView = controller.subscribe(setView);
    const unsubEvent = transport.subscribe((event) => {
      if (dispatcher.dispatch(event)) {
        if (event.type === "LINE_RACE_MATCH_SNAPSHOT")
          feedbackPresenter.reconcileSnapshot(
            event.snapshot,
            event.snapshot.serverTime,
          );
        else feedbackPresenter.ingestServerEvent(event, user.userId);
        telemetry.ingestServerEvent(event, user.userId);
        if (event.type === "LINE_RACE_MATCH_SNAPSHOT") {
          reconnectAttempts.current = 0;
          setRecoveryFailed(false);
          setError(null);
        }
        if (
          event.type === "LINE_RACE_ATTACK_ACCEPTED" &&
          event.attackerPlayerId === user.userId
        ) {
          audio.play("ATTACK_APPROVED");
        } else if (
          event.type === "LINE_RACE_ATTACK_ACCEPTED" &&
          event.targetPlayerId === user.userId
        ) {
          audio.play("OBSTACLE_WARNING");
        } else if (
          event.type === "LINE_RACE_COUNTER_SUCCEEDED" &&
          event.playerId === user.userId
        ) {
          audio.play("COUNTER_SUCCESS");
        } else if (
          event.type === "LINE_RACE_TRAVERSAL_STARTED" &&
          event.playerId === user.userId
        ) {
          audio.play("COLLISION");
        }
      }
      if (
        event.type === "LINE_RACE_MATCH_SNAPSHOT" &&
        hydratedRoomId.current !== event.snapshot.roomId &&
        !hydratingRoom.current &&
        services.lineRaceRoomGateway
      ) {
        hydratingRoom.current = true;
        hydratedRoomId.current = event.snapshot.roomId;
        roomIdRef.current = event.snapshot.roomId;
        void services.lineRaceRoomGateway
          .getRoom(event.snapshot.roomId)
          .then(async (room) => {
            setLineRaceRoomSession?.({ ...room, currentUser: user });
            const local =
              sharedCameraSession.getStream() ??
              (await sharedCameraSession.start());
            setStream(local);
            if (media.getConnectionState() === "DISCONNECTED")
              await media.connect(room, local);
          })
          .catch((cause) => setError(text(cause)))
          .finally(() => {
            hydratingRoom.current = false;
          });
      }
      const officialResult =
        event.type === "LINE_RACE_MATCH_FINISHED"
          ? event
          : event.type === "LINE_RACE_MATCH_SNAPSHOT"
            ? controller.getView().finished
            : null;
      if (officialResult && !resultHandled.current) {
        resultHandled.current = true;
        audio.play("FINISH");
        LineRaceRoomSessionAdapter.saveResult(
          officialResult,
          telemetry.getDeviceObservedSummary(),
        );
        navigate(`/game/line-race/matches/${matchId}/result`, {
          state: { result: officialResult },
        });
      }
    });
    const unsubState = transport.subscribeConnectionState((state) => {
      setGameState(state);
      if (state === "ERROR" || state === "DISCONNECTED")
        controller.connectionLost();
      if (state === "CONNECTED") setError(null);
    });
    void connect().catch((cause) => setError(text(cause)));
    return () => {
      unsubView();
      unsubEvent();
      unsubState();
    };
  }, [
    audio,
    connect,
    controller,
    dispatcher,
    duelModel,
    feedbackPresenter,
    matchId,
    media,
    navigate,
    services.lineRaceRoomGateway,
    setLineRaceRoomSession,
    sharedCameraSession,
    telemetry,
    transport,
    user,
  ]);
  useEffect(
    () =>
      feedbackPresenter.subscribeEvents((event) =>
        telemetry.ingestActionFeedback(event),
      ),
    [feedbackPresenter, telemetry],
  );
  useEffect(() => {
    if (!matchId || hasBotParticipant) return;
    const unsubscribe = glyphTransport.subscribe((event) => {
      if (duelModel.ingestGlyphTurn(event)) setDuelView(duelModel.getView());
    });
    void glyphTransport
      .connect({
        url: config.gameWebSocketUrl,
        roomId: roomIdRef.current,
        playerId: user.userId,
        matchId,
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : createDevAuthHeaders(user),
      })
      .then(() => glyphTransport.requestSnapshot(matchId))
      .catch((cause) => setError(text(cause)));
    return () => {
      unsubscribe();
      glyphTransport.disconnect();
    };
  }, [
    accessToken,
    config.gameWebSocketUrl,
    duelModel,
    glyphTransport,
    hasBotParticipant,
    matchId,
    user,
  ]);
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [audio]);
  useEffect(
    () =>
      media.subscribe(() => {
        setRtcState(media.getConnectionState());
        setRemote(media.getRemoteParticipants()[0] ?? null);
      }),
    [media],
  );
  useEffect(() => {
    let active = true;
    const unsub = inputController.subscribe(setInput);
    void inputController.connect();
    const existing = sharedCameraSession.getStream();
    if (existing) setStream(existing);
    else
      void sharedCameraSession
        .start()
        .then((value) => active && setStream(value))
        .catch((cause) => active && setError(text(cause)));
    return () => {
      active = false;
      unsub();
    };
  }, [inputController, sharedCameraSession]);
  useEffect(() => {
    if (
      (gameState !== "ERROR" && gameState !== "DISCONNECTED") ||
      recoveryFailed
    )
      return;
    if (reconnectAttempts.current >= 3) {
      setRecoveryFailed(true);
      return;
    }
    const timer = window.setTimeout(() => {
      reconnectAttempts.current += 1;
      transport.disconnect();
      void connect().catch((cause) => {
        if (reconnectAttempts.current >= 3) setRecoveryFailed(true);
        else {
          setError(text(cause));
          // Force the next bounded attempt even when a transport batches
          // DISCONNECTED -> ERROR into one React render.
          setRetryCycle((cycle) => cycle + 1);
        }
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [connect, gameState, recoveryFailed, retryCycle, transport]);
  const inputContext = gateway.getInputContext();
  const gatewayView = {
    ...gateway.getSnapshot(),
    attackHand: view.hand,
    attackCooldownEndsAt: inputContext.attackCooldownEndsAt,
  };
  const getInputContext = useCallback(
    () => gateway.getInputContext(),
    [gateway],
  );
  const getDecoderSnapshot = useCallback(
    () => recognizer.getTemporalDecoder().getSnapshot(),
    [recognizer],
  );
  const userFeedback = useLineRaceFeedback(feedbackPresenter, {
    input,
    getContext: getInputContext,
    getDecoderSnapshot,
    minimumCandidateVotes: recognizer.getTemporalDecoder().getConfig()
      .minimumCandidateVotes,
    aiConnected: input.connectionState === "CONNECTED",
    gameConnected: gameState === "CONNECTED",
  });
  useEffect(() => {
    telemetry.observeFeedback(userFeedback);
    telemetry.feedbackDisplayed(userFeedback);
    if (
      userFeedback.effectKey &&
      userFeedback.effectKey !== lastFeedbackEffect.current
    )
      lastFeedbackEffect.current = userFeedback.effectKey;
  }, [telemetry, userFeedback]);
  useEffect(() => {
    const finalTen =
      view.clientState === "PLAYING" && view.render.remainingMs <= 10_000;
    if (finalTen && !finalTenPlayed.current) {
      finalTenPlayed.current = true;
      audio.play("FINAL_TEN");
    }
    if (!finalTen) finalTenPlayed.current = false;
  }, [audio, view.clientState, view.render.remainingMs]);
  if (hasBotParticipant)
    return (
      <main className={styles.page}>
        <section className={styles.panel} role="alert">
          <h1>사람 대 사람 경기만 입장할 수 있습니다</h1>
          <p>
            온라인 1:1에서는 두 사용자 모두 직접 지문자를 선택합니다. 봇전은
            턴제 봇 연습을 이용해 주세요.
          </p>
          <button type="button" onClick={() => navigate("/game/line-race")}>
            로비 복귀
          </button>
        </section>
      </main>
    );
  if (recoveryFailed)
    return (
      <main className={styles.page}>
        <section className={styles.panel} role="alert">
          <h1>경기를 복구할 수 없음</h1>
          <p>서버 경기 상태를 다시 불러오지 못했습니다.</p>
          <button
            type="button"
            onClick={() => {
              transport.disconnect();
              void media.disconnect();
              navigate("/game/line-race");
            }}
          >
            로비 복귀
          </button>
        </section>
      </main>
    );
  if (view.clientState === "ERROR" && view.lastError)
    return (
      <main className={styles.page}>
        <section className={styles.panel} role="alert">
          <h1>경기 상태를 시작할 수 없음</h1>
          <p>{view.lastError}</p>
          <div className={styles.actions}>
            <button
              type="button"
              onClick={() => {
                controller.connect();
                transport.requestSnapshot(matchId);
              }}
            >
              경기 상태 다시 불러오기
            </button>
            <button type="button" onClick={() => navigate("/game/line-race")}>
              로비 복귀
            </button>
          </div>
        </section>
      </main>
    );
  if (!view.synchronized)
    return (
      <main className={styles.page}>
        <section className={styles.panel} role="status" aria-live="polite">
          <h1>경기 시작 동기화 중</h1>
          <p>서버에서 카운트다운과 공격 패를 불러오고 있습니다.</p>
        </section>
      </main>
    );
  return (
    <main
      className={styles.page}
      data-line-race-game="true"
      data-final-ten={
        view.clientState === "PLAYING" && view.render.remainingMs <= 10_000
      }
      data-motion={motionMode}
    >
      <header className={styles.header}>
        <div>
          <small>동시 선택 · 3속성 턴 배틀</small>
          <h1>지문자 턴 배틀</h1>
          <p className={styles.matchMeta}>Match {matchId}</p>
        </div>
        <div className={styles.headerTools}>
          <LineRaceHud view={view} duel={duelView} />
          <LineRaceSoundToggle
            audio={audio}
            muted={muted}
            onMutedChange={setMuted}
          />
          <GlyphBattleOnboarding />
          {telemetry.enabled ? (
            <button type="button" onClick={() => telemetry.download()}>
              DEV 계측 JSON
            </button>
          ) : null}
        </div>
      </header>
      {view.clientState === "COUNTDOWN" ? (
        <p className={styles.countdown}>
          시작까지{" "}
          {Math.max(
            0,
            Math.ceil(
              (view.render.remainingMs -
                controller.getConfig().matchDurationMs) /
                1000,
            ),
          )}
        </p>
      ) : null}
      {error || view.lastError ? (
        <p role="alert" className={styles.error}>
          {error ?? view.lastError}
        </p>
      ) : null}
      <div className={styles.connectionStrip}>
        <LineRaceConnectionStatus
          game={gameState}
          rtc={rtcState}
          peer={remote}
          camera={Boolean(stream)}
          ai={input.connectionState}
          bot={false}
        />
      </div>
      <section className={styles.layout}>
        <div className={`${styles.panel} ${styles.canvas}`}>
          <LineRaceGameErrorBoundary
            resetKey={`${matchId}:${view.lastSequence}`}
            onRetry={() => transport.requestSnapshot(matchId)}
            onLobby={() => navigate("/game/line-race")}
          >
            <LineRaceGameShell
              runtime={runtime}
              clock={serverClock}
              config={controller.getConfig()}
              obstacleFeedback={obstacleFeedbackForUserView(userFeedback)}
              duelView={duelView}
            />
          </LineRaceGameErrorBoundary>
        </div>
        <aside className={`${styles.panel} ${styles.opponentOverlay}`}>
          <h2>{remote?.displayName ?? "상대방"}</h2>
          <GameVideoTile
            kind="REMOTE"
            label={remote?.displayName ?? "상대방"}
            stream={remote?.stream ?? null}
            cameraEnabled={remote?.cameraEnabled ?? false}
            connectionState={remote?.connectionState ?? "DISCONNECTED"}
          />
        </aside>
      </section>
      <section className={styles.media}>
        <LineRaceCameraPanel
          stream={stream}
          input={input}
          cameraError={error}
          performanceMonitor={recognizer.getPerformanceMonitor()}
          temporalDecoder={recognizer.getTemporalDecoder()}
          activePlayerSession={activePlayerSession}
          onLandmarkFrame={(frame) => inputController.sendLandmarkFrame(frame)}
          onHandNotDetected={(at) => inputController.notifyHandNotDetected(at)}
        />
        <div className={styles.side}>
          <LineRaceAttackHand
            gateway={gatewayView}
            input={input}
            now={inputContext.now}
            userFeedback={userFeedback}
            duelView={duelView}
            onDevSelect={devTurnSelect}
          />
          <LineRaceRecognitionStatus input={input} symbols={symbols} />
        </div>
      </section>
    </main>
  );
}
function text(cause: unknown) {
  return cause instanceof Error
    ? cause.message
    : "라인 레이스 연결에 실패했습니다.";
}
