import { Hammer } from "lucide-react";
import styles from "../battle.module.css";

export type ComboMeterEffect = { readonly id: number; readonly kind: "gain" | "break" | "attack" } | null;

interface BattleComboMeterProps {
  readonly count: number;
  readonly effect?: ComboMeterEffect;
  readonly hammerActive?: boolean;
}

export function BattleComboMeter({ count, effect, hammerActive = false }: BattleComboMeterProps) {
  const value = Math.max(0, Math.min(2, count));
  return <div className={styles.comboMeter} data-effect={effect?.kind ?? "none"} aria-label={`COMBO ${value}/3`}>
    <span className={styles.comboLabel}>{hammerActive || effect?.kind === "attack" ? "HAMMER ATTACK!" : `COMBO ${value}/3`}</span>
    <span key={effect?.id ?? 0} className={styles.comboSlots}>
      {[0, 1, 2].map((index) => <i key={index} className={[index < value ? styles.comboSlotFilled : "", index === value - 1 ? styles.comboSlotLatest : ""].filter(Boolean).join(" ")}><Hammer size={15} strokeWidth={2.6} aria-hidden="true" /></i>)}
    </span>
  </div>;
}
