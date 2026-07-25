import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import { createDevAuthHeaders } from "../../app/devAuthHeaders";
import { PythonWebSocketSignRecognizer } from "../../recognition";
import { COMPETITIVE_RECOGNITION_SYMBOLS } from "../../recognition/readiness/recognitionReadiness";
import { BattleResultClient } from "../../results/BattleResultClient";
import { useStrictModeSafeDispose } from "../../shared/useStrictModeSafeDispose";
import { GlyphBattleOnboarding, LineRaceAttackHand, LineRaceCameraPanel, LineRaceRecognitionStatus } from "../components";
import { DEFAULT_LINE_RACE_RUNTIME_CONFIG, type LineRaceRuntime, type LineRaceRuntimeSnapshot } from "../core";
import { createDevLineRaceScenario } from "../dev/createDevLineRaceScenario";
import { GlyphDuelModel, type GlyphDuelView } from "../duel/GlyphDuelModel";
import { GlyphTurnCommandGateway } from "../duel/GlyphTurnCommandGateway";
import type { GlyphTurnSnapshotEvent } from "../duel/GlyphTurnMatchContract";
import { LineRaceFeedbackPresenter, useLineRaceFeedback } from "../feedback";
import { DefaultLineRaceInputResolver, LineRaceContextualCandidateResolver, LineRaceSignInputController, type LineRaceInputContext, type LineRaceInputState } from "../recognition";
import { LineRaceGameShell } from "./LineRaceGameShell";
import styles from "./LineRaceGamePage.module.css";

const TURN_RUNTIME_CONFIG = {
  ...DEFAULT_LINE_RACE_RUNTIME_CONFIG,
  baseSpeedPerSecond: 0.001,
  matchDurationMs: 600_000,
  countdownMs: 10,
};
const TURN_CARD_SYMBOLS = ["ㄱ", "ㅗ", "ㅋ"].filter((symbol) => COMPETITIVE_RECOGNITION_SYMBOLS.includes(symbol));
const EMPTY_INPUT: LineRaceInputState = {
  connectionState: "DISCONNECTED",
  prediction: null,
  confirmedSymbol: null,
  lockedSymbol: null,
  lastResolution: null,
  feedback: { kind: "IDLE", message: "지문자 입력을 기다리고 있습니다." },
  error: null,
};

export function GlyphTurnOnlinePage() {
  const { roomId = "" } = useParams();
  const navigate = useNavigate();
  const { user, accessToken, config, services, glyphTurnTransport: transport, turnBattleRoomSession: room, setTurnBattleRoomSession, sharedCameraSession, activePlayerSession } = useGameModuleContext();
  const [snapshot, setSnapshot] = useState<GlyphTurnSnapshotEvent | null>(null);
  const snapshotRef = useRef<GlyphTurnSnapshotEvent | null>(null);
  snapshotRef.current = snapshot;
  const [connection, setConnection] = useState(() => transport?.getConnectionState() ?? "ERROR");
  const [error, setError] = useState<string | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const [resultSubmitting, setResultSubmitting] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(() => sharedCameraSession.getStream());
  const [input, setInput] = useState<LineRaceInputState>(EMPTY_INPUT);
  const resultReported = useRef(false);
  const playerIds = useMemo(
    () => [...new Set(room?.participants.map((participant) => participant.userId) ?? [user.userId])].slice(0, 2),
    [room?.participants, user.userId],
  );
  const playerIdsKey = playerIds.join("|");
  const hostId = room?.hostUserId ?? "";
  const matchId = room?.activeMatchId ?? roomId;
  const fighter = snapshot?.fighters.find((entry) => entry.playerId === user.userId);
  const opponent = snapshot?.fighters.find((entry) => entry.playerId !== user.userId);
  const localParticipant = room?.participants.find((participant) => participant.userId === user.userId);
  const localDisplayName = playerLabel(localParticipant?.displayName ?? user.displayName, user.userId);
  const opponentParticipant = room?.participants.find((participant) => participant.userId !== user.userId);
  const opponentDisplayName = playerLabel(opponentParticipant?.displayName, opponentParticipant?.userId);
  const visualSession = useMemo(() => {
    const scenario = createDevLineRaceScenario(TURN_RUNTIME_CONFIG);
    const duelModel = new GlyphDuelModel(user.userId);
    return { scenario, duelModel, dispose: () => scenario.runtime.dispose() };
  }, [user.userId]);
  const [duelView, setDuelView] = useState<GlyphDuelView>(() => visualSession.duelModel.getView());
  const labeledRuntime = useMemo<LineRaceRuntime>(() => {
    const runtime = visualSession.scenario.runtime;
    const label = (value: LineRaceRuntimeSnapshot): LineRaceRuntimeSnapshot => ({
      ...value,
      players: value.players.map((player) => ({
        ...player,
        displayName: player.playerId === "PLAYER_A" ? localDisplayName : opponentDisplayName,
      })),
    });
    return {
      start: (at) => runtime.start(at), update: (at) => runtime.update(at), pause: () => runtime.pause(), resume: () => runtime.resume(),
      reset: () => runtime.reset(), finish: () => runtime.finish(), getSnapshot: () => label(runtime.getSnapshot()),
      subscribe: (listener) => runtime.subscribe((value) => listener(label(value))), dispose: () => runtime.dispose(),
    };
  }, [localDisplayName, opponentDisplayName, visualSession]);
  const glyphCommandGateway = useMemo(
    () => transport ? new GlyphTurnCommandGateway(matchId, transport) : null,
    [matchId, transport],
  );
  const turnGateway = useMemo(() => ({
    resultAuthority: "SERVER" as const,
    submitAttack: async (command: { commandId: string; symbol: string; recognizedAt: number }) => {
      const current = snapshotRef.current;
      if (!glyphCommandGateway || !current || current.phase !== "PLANNING") throw new Error("TURN_NOT_PLANNING");
      glyphCommandGateway.choose(command.symbol, current.turn);
    },
    submitCounter: async () => { throw new Error("TURN_MODE_HAS_NO_COUNTER"); },
    getInputContext: (): LineRaceInputContext => {
      const current = snapshotRef.current;
      return {
        matchState: current?.phase === "FINISHED" ? "FINISHED" : current ? "PLAYING" : "IDLE",
        attackHand: TURN_CARD_SYMBOLS,
        attackCooldownEndsAt: 0,
        now: Date.now(),
        pendingObstacleCount: 0,
        maxPendingObstacles: 1,
        counterWindowMs: 0,
        supportedSymbols: TURN_CARD_SYMBOLS,
        counterableObstacles: [],
      };
    },
    getSnapshot: () => ({ attackHand: TURN_CARD_SYMBOLS, attackCooldownEndsAt: 0, lastConsumedSymbol: null, lastDrawnSymbol: null, lastCommandId: null }),
  }), [glyphCommandGateway]);
  const contextualResolver = useMemo(() => new LineRaceContextualCandidateResolver(() => turnGateway.getInputContext()), [turnGateway]);
  const recognizer = useMemo(() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl, predictionSelector: contextualResolver }), [config.aiWebSocketUrl, contextualResolver]);
  const feedbackPresenter = useMemo(() => new LineRaceFeedbackPresenter({ resultAuthority: "SERVER" }), []);
  const inputController = useMemo(() => new LineRaceSignInputController({
    recognizer,
    resolver: new DefaultLineRaceInputResolver(),
    gateway: turnGateway,
    getContext: () => turnGateway.getInputContext(),
    selectionChargeMs: 520,
    onActionFeedback: (event) => feedbackPresenter.dispatch(event),
  }), [feedbackPresenter, recognizer, turnGateway]);
  const resultClient = useMemo(() => new BattleResultClient({
    apiBaseUrl: config.roomApiBaseUrl,
    userId: user.userId,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : createDevAuthHeaders(user),
  }), [accessToken, config.roomApiBaseUrl, user]);
  useStrictModeSafeDispose(visualSession);
  useStrictModeSafeDispose(inputController);
  useStrictModeSafeDispose(feedbackPresenter);

  useEffect(() => { visualSession.scenario.controller.start(); }, [visualSession]);

  useEffect(() => {
    let active = true;
    const unsubscribe = inputController.subscribe(setInput);
    void inputController.connect();
    const existing = sharedCameraSession.getStream();
    if (existing) setStream(existing);
    else void sharedCameraSession.start()
      .then((media) => { if (active) setStream(media); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "카메라를 시작하지 못했습니다."); });
    return () => { active = false; unsubscribe(); };
  }, [inputController, sharedCameraSession]);

  useEffect(() => {
    if (!transport || !room || playerIds.length !== 2) {
      setError("P2P 게임 채널에 필요한 두 참가자 정보가 준비되지 않았습니다.");
      return;
    }
    setError(null);
    const unsubscribeEvent = transport.subscribe((event) => {
      if (event.type === "GLYPH_DUEL_SNAPSHOT") setSnapshot(event);
      if (visualSession.duelModel.ingestGlyphTurn(event)) setDuelView(visualSession.duelModel.getView());
    });
    const unsubscribeState = transport.subscribeConnectionState(setConnection);
    void transport.connect({ url: "webrtc-datachannel", roomId, playerId: user.userId, matchId, hostPlayerId: hostId, playerIds })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "P2P 연결에 실패했습니다."));
    return () => { unsubscribeEvent(); unsubscribeState(); transport.disconnect(); };
  }, [hostId, matchId, playerIdsKey, roomId, transport, user.userId, visualSession]);

  useEffect(() => {
    if (!snapshot || snapshot.phase !== "FINISHED" || resultReported.current) return;
    const host = snapshot.fighters.find((entry) => entry.playerId === hostId);
    const guest = snapshot.fighters.find((entry) => entry.playerId !== hostId);
    if (!host || !guest || !Number.isSafeInteger(Number(roomId))) return;
    resultReported.current = true;
    setResultSubmitting(true);
    const winnerUserId = host.health === guest.health ? null : host.health > guest.health ? host.playerId : guest.playerId;
    void resultClient.reportResult(Number(roomId), winnerUserId)
      .catch((cause) => setResultError(cause instanceof Error ? cause.message : "결과 전송에 실패했습니다."))
      .finally(() => setResultSubmitting(false));
  }, [hostId, resultClient, roomId, snapshot]);

  const getInputContext = useCallback(() => turnGateway.getInputContext(), [turnGateway]);
  const getDecoderSnapshot = useCallback(() => recognizer.getTemporalDecoder().getSnapshot(), [recognizer]);
  const userFeedback = useLineRaceFeedback(feedbackPresenter, {
    input,
    getContext: getInputContext,
    getDecoderSnapshot,
    minimumCandidateVotes: recognizer.getTemporalDecoder().getConfig().minimumCandidateVotes,
    aiConnected: input.connectionState === "CONNECTED",
    gameConnected: connection === "CONNECTED",
  });
  const devTurnSelect = import.meta.env.DEV && (import.meta.env.VITE_P2P_E2E === "true" || new URLSearchParams(window.location.search).get("devReady") === "1")
    ? (symbol: string) => glyphCommandGateway?.choose(symbol, snapshotRef.current?.turn ?? 1)
    : undefined;
  const returnToWaiting = async () => {
    if (!room || !setTurnBattleRoomSession || resultSubmitting) return;
    const roomGateway = services.turnBattleRoomGateway;
    if (!roomGateway) {
      setResultError("턴 배틀 대기방 연결을 찾지 못했습니다.");
      return;
    }
    setResultSubmitting(true);
    setResultError(null);
    try {
      await roomGateway.returnToWaiting(roomId);
      setTurnBattleRoomSession({
        ...room,
        status: room.playerCount >= room.maxPlayers ? "FULL" : "WAITING",
        hostReady: false,
        guestReady: false,
        currentUserReady: false,
        canStart: false,
        activeMatchId: null,
      });
      navigate(`/game/turn-battle/${roomId}`);
    } catch (cause) {
      setResultError(cause instanceof Error ? cause.message : "대기방으로 돌아가지 못했습니다.");
      setResultSubmitting(false);
    }
  };

  return <main className={styles.page} data-testid="glyph-turn-online" data-line-race-game="true">
    <header className={styles.header}>
      <div><small>동시 선택 · WebRTC P2P</small><h1>지문자 턴 배틀</h1></div>
      <div className={styles.headerTools}><GlyphBattleOnboarding /><button type="button" onClick={() => navigate("/game/turn-battle")}>대결 나가기</button></div>
    </header>
    <section className={styles.layout}>
      <div className={`${styles.panel} ${styles.canvas}`}>
        <LineRaceGameShell runtime={labeledRuntime} clock={visualSession.scenario.clock} config={TURN_RUNTIME_CONFIG} duelView={{ ...duelView, hostPlayerId: hostId }} />
      </div>
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
        <LineRaceAttackHand gateway={turnGateway.getSnapshot()} input={input} now={Date.now()} userFeedback={userFeedback} duelView={duelView} onDevSelect={devTurnSelect} />
        <LineRaceRecognitionStatus input={input} symbols={TURN_CARD_SYMBOLS} />
      </div>
    </section>
    <div className={styles.connectionStrip}><section><span>게임</span><strong>{connection}</strong><span>AI {input.connectionState}</span></section></div>
    {resultError ? <p role="alert" className={styles.error}>{resultError}</p> : null}
    {snapshot?.phase === "FINISHED" ? <section className={styles.practiceResult} role="dialog" aria-label="턴 배틀 결과"><h2>{fighter && opponent && fighter.health > opponent.health ? "승리" : fighter?.health === opponent?.health ? "무승부" : "패배"}</h2><p>최종 HP {fighter?.health ?? 0} : {opponent?.health ?? 0}</p><button type="button" disabled={resultSubmitting} onClick={() => void returnToWaiting()}>{resultSubmitting ? "결과 저장 중" : "다시 대기방"}</button></section> : null}
  </main>;
}
function playerLabel(displayName: string | undefined, userId: string | undefined): string {
  if (!userId) return displayName ?? "상대방";
  const compactId = userId.length > 12 ? `${userId.slice(0, 8)}…` : userId;
  return displayName ? `${displayName} · ${compactId}` : compactId;
}
