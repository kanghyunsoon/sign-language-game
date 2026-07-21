import { useState, type ReactNode } from "react";
import type { LineRaceController, LineRaceDevPlayerId, LineRaceRuntimeConfig, LineRaceRuntimeSnapshot } from "../core";
import styles from "./LineRaceDevHarness.module.css";

export interface LineRaceDevControlPanelProps {
  readonly controller: LineRaceController;
  readonly snapshot: LineRaceRuntimeSnapshot;
  readonly configDraft: LineRaceRuntimeConfig;
  readonly onConfigChange: (config: LineRaceRuntimeConfig) => void;
  readonly onApplyConfig: () => void;
  readonly debugPaths: boolean;
  readonly onDebugPathsChange: (visible: boolean) => void;
}

export function LineRaceDevControlPanel({ controller, snapshot, configDraft, onConfigChange, onApplyConfig, debugPaths, onDebugPathsChange }: LineRaceDevControlPanelProps) {
  const controllable = snapshot.state === "COUNTDOWN" || snapshot.state === "PLAYING";
  const configValid = Object.values(configDraft).every((value) => Number.isFinite(value) && value > 0);
  const templates = controller.getObstacleTemplates();
  const [symbol, setSymbol] = useState(templates[0]?.symbol ?? "ㄱ");
  const [targetPlayerId, setTargetPlayerId] = useState<LineRaceDevPlayerId>("PLAYER_A");
  const [warningDurationMs, setWarningDurationMs] = useState(700);
  const [fallDurationMs, setFallDurationMs] = useState(520);
  const [penaltyMs, setPenaltyMs] = useState(1_700);
  const obstacleTimingValid = [warningDurationMs, fallDurationMs, penaltyMs]
    .every((value) => Number.isFinite(value) && value > 0);
  const obstacleOptions = { symbol, targetPlayerId, warningDurationMs, fallDurationMs, penaltyMs } as const;
  const nearestActive = snapshot.obstacles.find((item) => item.targetPlayerId === targetPlayerId && item.symbol === symbol && item.state === "ACTIVE");
  const setNumber = (key: keyof LineRaceRuntimeConfig, value: string) => onConfigChange({ ...configDraft, [key]: Number(value) });

  return (
    <aside className={styles.controlPanel} aria-label="라인 레이스 개발 제어판">
      <h2>개발 제어판</h2>
      <p>상태 <strong>{snapshot.state}</strong> · 승자 <strong>{snapshot.winnerPlayerId ?? (snapshot.state === "FINISHED" ? "DRAW" : "-")}</strong></p>
      <div className={styles.buttonGroup}>
        <button type="button" onClick={() => controller.start()}>경기 시작</button>
        <button type="button" disabled={!controllable} onClick={() => controller.pause()}>일시정지</button>
        <button type="button" disabled={snapshot.state !== "PAUSED"} onClick={() => controller.resume()}>재개</button>
        <button type="button" onClick={() => controller.reset()}>경기 초기화</button>
      </div>
      <ControlRow label="진행도"><button type="button" disabled={!controllable} onClick={() => controller.addProgress("PLAYER_A")}>A 진행도 +100</button><button type="button" disabled={!controllable} onClick={() => controller.addProgress("PLAYER_B")}>B 진행도 +100</button></ControlRow>
      <ControlRow label="A 지연"><button type="button" disabled={!controllable} onClick={() => controller.applyPenalty("PLAYER_A", 500)}>+500ms</button><button type="button" disabled={!controllable} onClick={() => controller.applyPenalty("PLAYER_A", 1_500)}>+1500ms</button></ControlRow>
      <ControlRow label="B 지연"><button type="button" disabled={!controllable} onClick={() => controller.applyPenalty("PLAYER_B", 500)}>+500ms</button><button type="button" disabled={!controllable} onClick={() => controller.applyPenalty("PLAYER_B", 1_500)}>+1500ms</button></ControlRow>
      <ControlRow label="Traversing"><button type="button" disabled={!controllable} onClick={() => controller.startTraversing("PLAYER_A")}>A Traversing 시작</button><button type="button" disabled={!controllable} onClick={() => controller.startTraversing("PLAYER_B")}>B Traversing 시작</button></ControlRow>
      <ControlRow label="종료"><button type="button" disabled={!controllable} onClick={() => controller.forceWinner("PLAYER_A")}>A 강제 승리</button><button type="button" disabled={!controllable} onClick={() => controller.forceWinner("PLAYER_B")}>B 강제 승리</button><button type="button" disabled={!controllable} onClick={() => controller.finishByTime()}>시간 종료</button></ControlRow>

      <fieldset className={styles.obstacleControls}>
        <legend>자모 장애물</legend>
        <label>지원 자모<select value={symbol} onChange={(event) => setSymbol(event.target.value)}>{templates.map((template) => <option key={template.templateId} value={template.symbol}>{template.symbol}</option>)}</select></label>
        <label>대상<select value={targetPlayerId} onChange={(event) => setTargetPlayerId(event.target.value as LineRaceDevPlayerId)}><option value="PLAYER_A">PLAYER_A</option><option value="PLAYER_B">PLAYER_B</option></select></label>
        <ConfigField label="warningMs" value={warningDurationMs} onChange={(value) => setWarningDurationMs(Number(value))} />
        <ConfigField label="fallDurationMs" value={fallDurationMs} onChange={(value) => setFallDurationMs(Number(value))} />
        <ConfigField label="penaltyMs" value={penaltyMs} onChange={(value) => setPenaltyMs(Number(value))} />
        <div className={styles.obstacleButtons}>
          <button type="button" disabled={!controllable || !obstacleTimingValid} onClick={() => controller.spawnObstacle(obstacleOptions)}>장애물 생성</button>
          <button type="button" disabled={!controllable || !obstacleTimingValid} onClick={() => { for (let index = 0; index < 3; index += 1) controller.spawnObstacle(obstacleOptions); }}>장애물 3개 연속 생성</button>
          <button type="button" disabled={!controllable || !nearestActive} onClick={() => controller.counterNearestObstacle(targetPlayerId, symbol)}>카운터 성공</button>
          <button type="button" disabled={!controllable || !nearestActive} onClick={() => nearestActive && controller.forceObstacleTraversal(nearestActive.obstacleId)}>강제 Traversing</button>
          <button type="button" disabled={snapshot.obstacles.length === 0} onClick={() => controller.removeAllObstacles()}>모든 장애물 제거</button>
        </div>
        <label className={styles.debugToggle}><input type="checkbox" checked={debugPaths} onChange={(event) => onDebugPathsChange(event.target.checked)} /> 경로 Debug 표시</label>
        <ol className={styles.obstacleList}>{snapshot.obstacles.map((item) => <li key={item.obstacleId}>{item.symbol} · {item.targetPlayerId} · {item.coursePosition.toFixed(0)} · {item.state}</li>)}</ol>
      </fieldset>

      <fieldset className={styles.configGrid}>
        <legend>Runtime Config</legend>
        <ConfigField label="raceLength" value={configDraft.raceLength} onChange={(value) => setNumber("raceLength", value)} />
        <ConfigField label="baseSpeed" value={configDraft.baseSpeedPerSecond} onChange={(value) => setNumber("baseSpeedPerSecond", value)} />
        <ConfigField label="matchDuration" value={configDraft.matchDurationMs} onChange={(value) => setNumber("matchDurationMs", value)} />
        <ConfigField label="countdown" value={configDraft.countdownMs} onChange={(value) => setNumber("countdownMs", value)} />
        <button type="button" disabled={!configValid} onClick={onApplyConfig}>설정 적용</button>
      </fieldset>
    </aside>
  );
}

function ControlRow({ label, children }: { readonly label: string; readonly children: ReactNode }) { return <section className={styles.controlRow}><strong>{label}</strong><div>{children}</div></section>; }
function ConfigField({ label, value, onChange }: { readonly label: string; readonly value: number; readonly onChange: (value: string) => void }) { return <label>{label}<input type="number" min="1" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
