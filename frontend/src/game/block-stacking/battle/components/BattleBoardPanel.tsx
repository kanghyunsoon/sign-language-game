import { useMemo, type ReactNode } from "react";
import type { GameCanvasProps } from "../../components/GameCanvas";
import { GameCanvas } from "../../components/GameCanvas";
import { BATTLE_DANGER_LINE_Y, BATTLE_LETTER_SIZE } from "../core/BattleRuntimeConfig";
import styles from "../battle.module.css";

interface BattleBoardPanelProps extends Pick<GameCanvasProps, "onRendererReady" | "onViewportResize" | "rendererConfig"> { readonly title: string; readonly subtitle: string; readonly toolbar?: ReactNode; }
export function BattleBoardPanel({ title, subtitle, toolbar, rendererConfig, ...canvasProps }: BattleBoardPanelProps) {
  const stableRendererConfig = useMemo(() => ({ letterWidth: BATTLE_LETTER_SIZE, letterHeight: BATTLE_LETTER_SIZE, dangerLineY: BATTLE_DANGER_LINE_Y, ...rendererConfig }), [rendererConfig?.width, rendererConfig?.height, rendererConfig?.dangerLineY, rendererConfig?.dangerLineRatio, rendererConfig?.letterWidth, rendererConfig?.letterHeight, rendererConfig?.removalHighlightDurationMs]);
  return <section className={styles.boardPanel}><header><div><span>{subtitle}</span><h2>{title}</h2></div>{toolbar}</header><GameCanvas className={styles.boardCanvas} rendererConfig={stableRendererConfig} {...canvasProps} /></section>;
}

