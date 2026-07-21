import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useGameModuleContext } from "../../app/GameModuleContext";
import { KeyboardSignRecognizer, PythonWebSocketSignRecognizer } from "../../recognition";
import {
  LineRaceAttackHand,
  LineRaceCameraPanel,
  LineRaceIncomingObstaclePanel,
  LineRaceRecognitionStatus,
} from "../components";
import {
  DEFAULT_LINE_RACE_RUNTIME_CONFIG,
  isLineRaceDevHarnessEnabled,
  type LineRaceRuntimeConfig,
  type LineRaceRuntimeSnapshot,
} from "../core";
import { DefaultLineRaceInputResolver, LineRaceSignInputController, type LineRaceInputState } from "../recognition";
import { deriveLineRaceActionTarget, type LineRaceUserFeedbackView } from "../feedback";
import { DefaultLocalLineRaceCommandGateway, type LocalLineRaceGatewaySnapshot } from "../transport";
import { LineRaceGameShell } from "../pages/LineRaceGameShell";
import { createDevLineRaceScenario } from "./createDevLineRaceScenario";
import { useSharedCameraOwnerCleanup } from "../../media/camera/useSharedCameraOwnerCleanup";
import { useStrictModeSafeDispose } from "../../shared/useStrictModeSafeDispose";
import { LineRaceDevControlPanel } from "./LineRaceDevControlPanel";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";

const DEV_DUEL_VIEW: GlyphDuelView = {
  local: { playerId: "PLAYER_A", health: 86, focus: 64, guardPercent: 32, rounds: 1 },
  opponent: { playerId: "PLAYER_B", health: 58, focus: 38, guardPercent: 0, rounds: 0 },
  phase: "REVEAL",
  turn: 4,
  prompt: "두 기술을 동시에 공개합니다",
  lastMove: { symbol:"ㄱ",role:"ATTACK",roleLabel:"공격",elementLabel:"획",label:"획 베기",damage:16,attackerId:"PLAYER_A",targetId:"PLAYER_B",effectiveness:"상성 우위" },
  callout: "ㄱ 획 베기 · 16 피해 · 상성 우위",
  calloutAt: 0,
  revision: 1,
};
import styles from "./LineRaceDevHarness.module.css";
import recognitionStyles from "../components/LineRaceRecognition.module.css";

const EMPTY_INPUT_STATE: LineRaceInputState = {
  connectionState: "DISCONNECTED", prediction: null, confirmedSymbol: null, lockedSymbol: null,
  lastResolution: null, feedback: { kind: "IDLE", message: "지문자 입력을 기다리고 있습니다." }, error: null,
};

const EMPTY_GATEWAY_STATE: LocalLineRaceGatewaySnapshot = {
  attackHand: ["ㄱ", "ㄴ", "ㄷ"], attackCooldownEndsAt: 0,
  lastConsumedSymbol: null, lastDrawnSymbol: null, lastCommandId: null,
};

const KEYBOARD_SYMBOL_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "q", "w"] as const;

export function LineRaceDevHarnessPage() {
  if (!isLineRaceDevHarnessEnabled()) return null;
  return <LineRaceDevHarnessRuntimePage />;
}

export function LineRaceDevHarnessRuntimePage() {
  const { sharedCameraSession, activePlayerSession, config } = useGameModuleContext();
  const [configDraft, setConfigDraft] = useState<LineRaceRuntimeConfig>(DEFAULT_LINE_RACE_RUNTIME_CONFIG);
  const [activeConfig, setActiveConfig] = useState<LineRaceRuntimeConfig>(DEFAULT_LINE_RACE_RUNTIME_CONFIG);
  const [debugPaths, setDebugPaths] = useState(false);
  const scenario = useMemo(() => createDevLineRaceScenario(activeConfig), [activeConfig]);
  const [snapshot, setSnapshot] = useState<LineRaceRuntimeSnapshot>(() => scenario.runtime.getSnapshot());
  const supportedSymbols = useMemo(() => scenario.controller.getObstacleTemplates().map((template) => template.symbol), [scenario]);
  const recognizer = useMemo(() => new PythonWebSocketSignRecognizer({ url: config.aiWebSocketUrl }), [config.aiWebSocketUrl]);
  const keyboardRecognizer = useMemo(() => new KeyboardSignRecognizer({ supportedSymbols }), [supportedSymbols]);
  const gateway = useMemo(() => new DefaultLocalLineRaceCommandGateway({ controller: scenario.controller }), [scenario]);
  const inputController = useMemo(() => new LineRaceSignInputController({
    recognizer,
    keyboardRecognizer,
    resolver: new DefaultLineRaceInputResolver(),
    gateway,
    getContext: () => gateway.getInputContext(),
  }), [gateway, keyboardRecognizer, recognizer]);
  const [inputState, setInputState] = useState<LineRaceInputState>(EMPTY_INPUT_STATE);
  const [gatewayState, setGatewayState] = useState<LocalLineRaceGatewaySnapshot>(EMPTY_GATEWAY_STATE);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  useSharedCameraOwnerCleanup(sharedCameraSession,()=>activePlayerSession?.clearRegistration());
  useStrictModeSafeDispose(scenario.runtime);
  useStrictModeSafeDispose(inputController);
  useStrictModeSafeDispose(gateway);

  useEffect(() => {
    setSnapshot(scenario.runtime.getSnapshot());
    const timer = window.setInterval(() => setSnapshot(scenario.runtime.getSnapshot()), 200);
    return () => {
      window.clearInterval(timer);
    };
  }, [scenario]);

  useEffect(() => {
    let active = true;
    let observedTrack: MediaStreamTrack | null = null;
    const onTrackEnded = () => { if (active) setCameraError("카메라 Track이 종료되었습니다."); };
    const unsubscribeInput = inputController.subscribe(setInputState);
    const unsubscribeGateway = gateway.subscribe(setGatewayState);
    void inputController.connect();
    const existingStream=sharedCameraSession.getStream();
    const attachStream=(stream:MediaStream)=>{if(!active)return;setCameraStream(stream);setCameraError(null);const track=stream.getVideoTracks()[0];if(track&&track!==observedTrack){observedTrack=track;track.addEventListener("ended",onTrackEnded,{once:true});}};
    if(existingStream)attachStream(existingStream);else void sharedCameraSession.start().then(attachStream).catch((cause)=>{if(active)setCameraError(cameraStartErrorMessage(cause));});
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === " " || event.key.toLowerCase() === "r") {
        event.preventDefault();
        keyboardRecognizer.releaseHand();
        return;
      }
      const keyIndex = KEYBOARD_SYMBOL_KEYS.indexOf(event.key.toLowerCase() as typeof KEYBOARD_SYMBOL_KEYS[number]);
      const directIndex = supportedSymbols.indexOf(event.key);
      const symbol = directIndex >= 0 ? supportedSymbols[directIndex] : supportedSymbols[keyIndex];
      if (symbol) keyboardRecognizer.confirmSymbol(symbol);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      active = false;
      window.removeEventListener("keydown", onKeyDown);
      observedTrack?.removeEventListener("ended", onTrackEnded);
      unsubscribeInput();
      unsubscribeGateway();
    };
  }, [gateway, inputController, keyboardRecognizer, sharedCameraSession, supportedSymbols]);

  const devTarget = deriveLineRaceActionTarget(gateway.getInputContext());
  const devFeedback: LineRaceUserFeedbackView = {
    state: devTarget.kind === "NONE" ? "IDLE" : "TARGET_AVAILABLE",
    target: devTarget,
    message: devTarget.kind === "COUNTER" ? `${devTarget.primarySymbol} 카운터 목표` : "공격 패에서 지문자를 선택하세요.",
    obstacleId: devTarget.kind === "COUNTER" ? devTarget.obstacleId : undefined,
  };

  return (
    <main className={styles.page} data-testid="line-race-dev-harness">
      <header className={styles.header}>
        <div>
          <span>서버 Room 없는 로컬 AI 개발 모드</span>
          <h1>지문자 라인 레이스 Dev Harness</h1>
        </div>
        <Link to="/game/line-race"><ArrowLeft aria-hidden="true" size={17} /> 라인 레이스 로비</Link>
      </header>
      <p role="note"><strong>개발 진단 전용이며 키보드 입력은 실제 수어 인식 검증이 아닙니다.</strong></p>
      <section className={styles.workspace}>
        <div>
          <LineRaceGameShell runtime={scenario.runtime} clock={scenario.clock} config={activeConfig} debugPaths={debugPaths} duelView={DEV_DUEL_VIEW} />
          <section className={styles.summary} aria-label="Runtime 요약">
            <strong>{snapshot.state}</strong>
            <span>남은 시간 {(snapshot.remainingMs / 1000).toFixed(1)}초</span>
            {snapshot.players.map((player) => (
              <span key={player.playerId}>{player.playerId}: {player.progress.toFixed(1)} / {activeConfig.raceLength}</span>
            ))}
          </section>
          <section className={recognitionStyles.recognitionWorkspace}>
            <LineRaceCameraPanel
              stream={cameraStream}
              input={inputState}
              cameraError={cameraError}
              performanceMonitor={recognizer.getPerformanceMonitor()}
              temporalDecoder={recognizer.getTemporalDecoder()}
              activePlayerSession={activePlayerSession}
              onLandmarkFrame={(frame) => inputController.sendLandmarkFrame(frame)}
              onHandNotDetected={(capturedAt) => inputController.notifyHandNotDetected(capturedAt)}
            />
            <div className={recognitionStyles.side}>
              <LineRaceAttackHand gateway={gatewayState} input={inputState} now={gateway.getInputContext().now} userFeedback={devFeedback} />
              <LineRaceIncomingObstaclePanel context={gateway.getInputContext()} baseSpeedPerSecond={activeConfig.baseSpeedPerSecond} userFeedback={devFeedback} />
              <LineRaceRecognitionStatus input={inputState} symbols={supportedSymbols} keyboard={keyboardRecognizer} />
            </div>
          </section>
        </div>
        <LineRaceDevControlPanel
          controller={scenario.controller}
          snapshot={snapshot}
          configDraft={configDraft}
          onConfigChange={setConfigDraft}
          onApplyConfig={() => setActiveConfig({ ...configDraft })}
          debugPaths={debugPaths}
          onDebugPathsChange={setDebugPaths}
        />
      </section>
    </main>
  );
}

function cameraStartErrorMessage(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "name" in cause && cause.name === "NotAllowedError") {
    return "카메라 권한이 거절되었습니다. 브라우저 사이트 설정에서 카메라를 허용하세요.";
  }
  return cause instanceof Error ? cause.message : "카메라를 시작하지 못했습니다.";
}
