import { useEffect, useRef, useState } from "react";

import otterImage from "../../assets/battle-otter-shell-play.png";
import styles from "./OtterFollower.module.css";

const REACTION_DURATION_MS = 1_450;

type Reaction = "love" | "surprise";

export function OtterFollower() {
  const reactionTimerRef = useRef<number | null>(null);
  const nextReactionRef = useRef<Reaction>("surprise");
  const [reaction, setReaction] = useState<Reaction | null>(null);

  useEffect(() => () => {
    if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current);
  }, []);

  const handlePet = () => {
    if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current);

    const nextReaction = nextReactionRef.current;
    nextReactionRef.current = nextReaction === "surprise" ? "love" : "surprise";
    setReaction(nextReaction);
    reactionTimerRef.current = window.setTimeout(() => setReaction(null), REACTION_DURATION_MS);
  };

  return (
    <button
      type="button"
      className={`${styles.root} ${reaction === "love" ? styles.loving : ""} ${reaction === "surprise" ? styles.surprised : ""}`}
      onClick={handlePet}
      aria-label="수달 쓰다듬기"
      title="수달을 눌러 보세요"
    >
      <div className={styles.figure} aria-hidden="true">
        <img className={styles.otter} src={otterImage} alt="" />
        <span className={styles.mouth} />
        <span className={styles.playSparkle}>✦</span>
        <span className={styles.playDot}>·</span>
        <span className={`${styles.reactionHeart} ${styles.firstHeart}`}>♥</span>
        <span className={`${styles.reactionHeart} ${styles.secondHeart}`}>♥</span>
        <span className={styles.surpriseMark}>!</span>
      </div>
    </button>
  );
}
