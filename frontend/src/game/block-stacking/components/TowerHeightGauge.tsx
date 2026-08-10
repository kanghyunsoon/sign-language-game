import type { CSSProperties } from "react";

interface TowerHeightGaugeProps {
  readonly ratio: number;
  readonly className?: string;
  readonly label?: string;
}

export function TowerHeightGauge({ ratio, className, label = "TOWER" }: TowerHeightGaugeProps) {
  const level = Math.max(0, Math.min(1, ratio));
  const percent = Math.round(level * 100);
  return (
    <div
      className={["tower-height-gauge", className].filter(Boolean).join(" ")}
      style={{ "--tower-gauge-level": level } as CSSProperties}
      aria-label={`${label} height ${percent}%`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <span className="tower-height-gauge__label">{label}</span>
      <span className="tower-height-gauge__track" aria-hidden="true">
        <span className="tower-height-gauge__fill"><i /><i /><i /><i /><i /></span>
        <span className="tower-height-gauge__cap" />
      </span>
      <strong className="tower-height-gauge__value">{percent}</strong>
    </div>
  );
}
