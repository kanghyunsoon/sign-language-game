import { useMemo, type ReactNode } from "react";
import type { GameCanvasProps } from "../../components/GameCanvas";
import { GameCanvas } from "../../components/GameCanvas";
import { TowerHeightGauge } from "../../components/TowerHeightGauge";
import { BATTLE_DANGER_LINE_RATIO, BATTLE_DANGER_LINE_Y, BATTLE_LETTER_SIZE } from "../core/BattleRuntimeConfig";
import styles from "../battle.module.css";

interface BattleBoardPanelProps extends Pick<GameCanvasProps, "onRendererReady" | "onViewportResize" | "rendererConfig"> { readonly title: string; readonly subtitle?: string; readonly toolbar?: ReactNode; readonly className?: string; readonly towerHeightRatio?: number; readonly dropBurst?: { readonly id: number; readonly symbol: string } | null; }
export function BattleBoardPanel({ title, subtitle, toolbar, className, rendererConfig, towerHeightRatio = 0, dropBurst, ...canvasProps }: BattleBoardPanelProps) {
  const stableRendererConfig = useMemo(() => ({ letterWidth: BATTLE_LETTER_SIZE, letterHeight: BATTLE_LETTER_SIZE, dangerLineY: BATTLE_DANGER_LINE_Y, ...rendererConfig }), [rendererConfig?.width, rendererConfig?.height, rendererConfig?.dangerLineY, rendererConfig?.dangerLineRatio, rendererConfig?.letterWidth, rendererConfig?.letterHeight, rendererConfig?.removalHighlightDurationMs, rendererConfig?.showScenery]);
  const finishLineRatio = stableRendererConfig.dangerLineRatio ?? BATTLE_DANGER_LINE_RATIO;
  return <section className={[styles.boardPanel, className].filter(Boolean).join(" ")} style={{ background: "transparent" }}><header><div>{subtitle ? <span>{subtitle}</span> : null}<h2>{title}</h2></div>{toolbar}</header><div className={styles.boardPlayArea} style={{ background: "transparent" }}><GameCanvas className={styles.boardCanvas} rendererConfig={stableRendererConfig} {...canvasProps} /><span className={styles.boardFinishLine} style={{ top: `${finishLineRatio * 100}%` }} aria-hidden="true" />{dropBurst ? <span key={dropBurst.id} className={styles.claimDropBurst} aria-hidden="true"><i/><i/></span> : null}<TowerHeightGauge ratio={towerHeightRatio} className={styles.boardTowerHeightGauge} label="STACK" /></div></section>;
}

