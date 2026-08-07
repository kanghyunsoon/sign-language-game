import { Link } from "react-router-dom";

import {
  fixedCanvasStyle,
  useFixedCanvasScale,
} from "../../../shared/layout/fixedCanvas";
import { AppNav } from "../../../shared/nav/AppNav";

interface PracticeSessionHeaderProps {
  readonly onBack?: () => void;
}

export function PracticeSessionHeader({ onBack }: PracticeSessionHeaderProps) {
  const canvas = useFixedCanvasScale();

  return (
    <div
      className="practice-session-header-canvas"
      style={fixedCanvasStyle(canvas)}
    >
      <header className="practice-session-header">
        {onBack ? (
          <button
            className="practice-page-back-button"
            type="button"
            onClick={onBack}
            aria-label="뒤로 가기"
          >
            ←
          </button>
        ) : (
          <Link
            className="practice-page-back-button"
            to="/practice"
            aria-label="뒤로 가기"
          >
            ←
          </Link>
        )}

        <AppNav prefix="practice-session" metric="fixed" hasBackButton />
      </header>
    </div>
  );
}
