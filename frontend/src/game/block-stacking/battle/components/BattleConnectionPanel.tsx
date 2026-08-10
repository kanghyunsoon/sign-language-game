import type { BattleConnectionState } from "../transport/battleTransportTypes";
import styles from "../battle.module.css";
export function BattleConnectionPanel({ game, rtc, ai, camera }: { readonly game: BattleConnectionState; readonly rtc: string; readonly ai: string; readonly camera: string }) { return <div className={styles.connections} aria-label="연결 상태"><span data-state={game}>게임 {game}</span><span data-state={rtc}>영상 {rtc}</span><span data-state={ai}>AI {ai}</span><span data-state={camera}>카메라 {camera}</span></div>; }
