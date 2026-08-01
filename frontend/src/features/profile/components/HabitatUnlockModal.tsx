import { X } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import otterLevelUp from "../assets/habitats/otter_level_up.png";
import type { HabitatUnlockLevel } from "../data/habitatUnlock";
import "./HabitatUnlockModal.css";

type HabitatUnlockModalProps = {
  unlockedLevel: HabitatUnlockLevel;
  onClose: () => void;
};

export function HabitatUnlockModal({
  unlockedLevel,
  onClose,
}: HabitatUnlockModalProps) {
  const navigate = useNavigate();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="habitat-unlock-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="habitat-unlock-title"
    >
      <section className="habitat-unlock-card">
        <button
          className="habitat-unlock-close"
          type="button"
          aria-label="새 집 해금 안내 닫기"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
        <img src={otterLevelUp} alt="새 집이 열려 기뻐하는 수달" />
        <h2 id="habitat-unlock-title">
          {unlockedLevel}레벨을 달성해서
          <br />
          수달의 새 집이 열렸어요!
        </h2>
        <button
          className="habitat-unlock-confirm"
          type="button"
          onClick={() => navigate("/profile?openHabitat=true")}
        >
          확인하러 가기
        </button>
      </section>
    </div>
  );
}
