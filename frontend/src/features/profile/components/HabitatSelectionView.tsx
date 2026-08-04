import { ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import { useMemo, useState } from "react";
import otterThinking from "../assets/habitats/otter_thinking.png";
import {
  habitatOptions,
  type HabitatId,
} from "../data/habitatCatalog";
import {
  getSelectedHabitatId,
  saveSelectedHabitatId,
} from "../data/selectedHabitat";
import "./HabitatSelectionView.css";

type HabitatSelectionViewProps = {
  currentLevel: number;
  onClose: () => void;
};

export function HabitatSelectionView({
  currentLevel,
  onClose,
}: HabitatSelectionViewProps) {
  const savedHabitatId = getSelectedHabitatId();
  const initialIndex = Math.max(
    habitatOptions.findIndex((habitat) => habitat.id === savedHabitatId),
    0,
  );
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);
  const [selectedHabitatId, setSelectedHabitatId] =
    useState<HabitatId>(savedHabitatId);
  const focusedHabitat = habitatOptions[focusedIndex];
  const isFocusedHabitatUnlocked =
    currentLevel >= focusedHabitat.unlockLevel;
  const isAlreadySelected = focusedHabitat.id === selectedHabitatId;

  const cardOffsets = useMemo(
    () =>
      habitatOptions.map((_, index) => {
        const distance = index - focusedIndex;
        const arcDistance = Math.abs(distance) ** 2;
        /*
         * 가운데 카드만 조금 키운다. scale을 마지막에 두면 translateX의 % 기준이
         * 확대 전 카드 너비로 남아, 커진 카드 때문에 간격이 흔들리지 않는다.
         * 되돌아가는 쪽도 같은 transform 전환(.28s)을 타서 자연히 작아진다.
         */
        const scale = distance === 0 ? 1.08 : 0.9;
        return {
          transform: `translateX(${distance * 86}%) translateY(calc(${arcDistance} * min(1.0417vw, 1.6667vh))) rotate(${distance * 5}deg) scale(${scale})`,
          zIndex: habitatOptions.length - Math.abs(distance),
        };
      }),
    [focusedIndex],
  );

  const moveFocus = (direction: -1 | 1) => {
    setFocusedIndex((current) => {
      const next = current + direction;
      return Math.min(Math.max(next, 0), habitatOptions.length - 1);
    });
  };

  const handleSelect = () => {
    if (!isFocusedHabitatUnlocked) return;
    saveSelectedHabitatId(focusedHabitat.id);
    setSelectedHabitatId(focusedHabitat.id);
  };

  return (
    <div
      className="habitat-selection-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="habitat-selection-title"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
    >
      <section className="habitat-selection-view">
        <button
          className="habitat-selection-close"
          type="button"
          aria-label="집 선택 화면 닫기"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>

        <header>
          <h2 id="habitat-selection-title">수달의 집 선택하기</h2>
          <p>마음에 드는 집을 골라 수달에게 선물해 주세요.</p>
        </header>

        <div className="habitat-card-carousel">
          {habitatOptions.map((habitat, index) => {
            const isUnlocked = currentLevel >= habitat.unlockLevel;
            const isFocused = index === focusedIndex;

            return (
              <button
                className={`habitat-card${isFocused ? " is-focused" : ""}${
                  isUnlocked ? "" : " is-locked"
                }`}
                style={cardOffsets[index]}
                type="button"
                key={habitat.id}
                aria-label={`${habitat.name}${
                  isUnlocked ? "" : `, 레벨 ${habitat.unlockLevel}에서 해금`
                }`}
                onClick={() => setFocusedIndex(index)}
              >
                <img src={habitat.image} alt="" />
                {!isUnlocked && (
                  <span className="habitat-lock">
                    <Lock aria-hidden="true" />
                    레벨 {habitat.unlockLevel}에서 해금
                  </span>
                )}
                <span className="habitat-card-name">{habitat.name}</span>
              </button>
            );
          })}
        </div>

        <div className="habitat-otter-stage">
          <button
            type="button"
            aria-label="이전 집"
            disabled={focusedIndex === 0}
            onClick={() => moveFocus(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <img src={otterThinking} alt="어떤 집을 고를지 고민하는 수달" />
          <button
            type="button"
            aria-label="다음 집"
            disabled={focusedIndex === habitatOptions.length - 1}
            onClick={() => moveFocus(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>

        <footer className="habitat-selection-footer">
          <div>
            <strong>{focusedHabitat.name}</strong>
            <p>
              {isFocusedHabitatUnlocked
                ? focusedHabitat.description
                : `레벨 ${focusedHabitat.unlockLevel}을 달성하면 만날 수 있어요.`}
            </p>
          </div>
          {isFocusedHabitatUnlocked && (
            <button
              type="button"
              disabled={isAlreadySelected}
              onClick={handleSelect}
            >
              {isAlreadySelected ? "선택됨" : "선택하기"}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
