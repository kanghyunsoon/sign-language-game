import type { HammerAttackEvent } from "../transport/battleTransportTypes";
import hammerOtterStrip from "../../assets/battle-hammer-otter-strip.webp";
import styles from "../battle.module.css";

interface HammerAttackOverlayProps {
  readonly event: HammerAttackEvent;
  readonly localPlayerId: string;
}

export function HammerAttackOverlay({ event, localPlayerId }: HammerAttackOverlayProps) {
  const localIsAttacker = event.attackerPlayerId === localPlayerId;
  const direction = localIsAttacker ? "right-to-left" : "left-to-right";
  const defenderSide = localIsAttacker ? "right" : "left";
  const x = Math.max(.14, Math.min(.86, event.sourceNormalizedX ?? .5));
  const y = Math.max(.2, Math.min(.78, event.sourceNormalizedY ?? .68));
  const left = defenderSide === "right" ? 50 + x * 50 : x * 50;
  return <div className={styles.hammerAttackLayer} data-direction={direction} aria-label="3연속 정답 망치 공격">
    <strong className={styles.hammerAttackBanner}>HAMMER ATTACK!</strong>
    <span className={styles.hammerOtter} style={{ left: `${left}%`, top: `${y * 100}%` }}>
      <i style={{ backgroundImage: `url(${hammerOtterStrip})` }} />
    </span>
    {event.victimLetterId && event.symbol ? <>
      <span className={styles.hammerVictim} style={{ left: `${left}%`, top: `${y * 100}%` }}>{event.symbol}</span>
      <span className={styles.hammerImpact} style={{ left: `${left}%`, top: `${y * 100}%` }}><i/><i/><i/></span>
    </> : null}
  </div>;
}
