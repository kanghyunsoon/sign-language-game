import type { NetworkLineRaceView } from "../core";
import type { GlyphDuelView } from "../duel/GlyphDuelModel";
import styles from "./LineRaceRecognition.module.css";

export function LineRaceHud({ view, duel }: { view: NetworkLineRaceView; duel: GlyphDuelView }) {
  const phase = duel.phase === "PLANNING" ? "동시 선택" : duel.phase === "WAITING" ? "상대 대기" : duel.phase === "REVEAL" ? "기술 공개" : "경기 종료";
  return <section className={styles.raceHud} aria-label="턴 배틀 HUD">
    <strong>TURN {duel.turn}</strong><span>{phase}</span><b>{Math.ceil(view.render.remainingMs / 1000)}초</b>
    <p>{duel.prompt}</p>
  </section>;
}
