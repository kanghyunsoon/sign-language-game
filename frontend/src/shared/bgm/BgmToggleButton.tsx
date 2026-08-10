import { Volume2, VolumeX } from "lucide-react";

import { useBgmMuted } from "./bgmMuteStore";
import "./BgmToggleButton.css";

interface BgmToggleButtonProps {
  /**
   * 화면 크기 기준. 캔버스를 vw/vh로 잡는 페이지는 "viewport",
   * 1920x1200 고정 캔버스를 transform으로 확대하는 페이지는 "fixed"를 쓴다.
   */
  readonly metric?: "viewport" | "fixed";
  /** 뒤로가기 버튼이 있는 화면에서는 그 옆으로 밀어 겹치지 않게 한다. */
  readonly offsetForBackButton?: boolean;
}

export function BgmToggleButton({
  metric = "viewport",
  offsetForBackButton = false,
}: BgmToggleButtonProps) {
  const [muted, toggleMuted] = useBgmMuted();

  const className = [
    "app-bgm-toggle",
    `app-bgm-toggle-${metric}`,
    offsetForBackButton ? "app-bgm-toggle-offset" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={className}
      type="button"
      aria-pressed={muted}
      aria-label={muted ? "배경음악 켜기" : "배경음악 끄기"}
      title={muted ? "배경음악 켜기" : "배경음악 끄기"}
      onClick={toggleMuted}
    >
      {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
    </button>
  );
}
