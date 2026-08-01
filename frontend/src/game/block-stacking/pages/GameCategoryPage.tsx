import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import gameMenuReference from "../assets/game-menu-reference-2d.png";
import gameMenuOtter from "../assets/game-menu-hero-otter-2d.png";
import { useGameModuleContext } from "../../app/GameModuleContext";
import styles from "../../shared/GameModule.module.css";

const CATEGORY_CANVAS_WIDTH = 1280;
const CATEGORY_CANVAS_HEIGHT = 720;

export function GameCategoryPage() {
  const { onExit } = useGameModuleContext();
  const navigate = useNavigate();
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [pageScale, setPageScale] = useState(1);

  useEffect(() => {
    const updatePageScale = () => {
      setPageScale(Math.min(
        window.innerWidth / CATEGORY_CANVAS_WIDTH,
        window.innerHeight / CATEGORY_CANVAS_HEIGHT,
      ));
    };

    updatePageScale();
    window.addEventListener("resize", updatePageScale);
    return () => window.removeEventListener("resize", updatePageScale);
  }, []);

  const goBack = () => {
    if (onExit) onExit();
    else navigate("/main");
  };

  return (
    <main
      className={`${styles.categoryPage} ${styles.categoryReferencePage}`}
      data-fixed-game-canvas="true"
      style={{ transform: `translate(-50%, -50%) scale(${pageScale})` }}
    >
      <img className={styles.categoryReferenceImage} src={gameMenuReference} alt="" aria-hidden="true" />
      <h1 className={styles.visuallyHidden}>수어의 달인 게임 선택</h1>

      <button
        type="button"
        className={styles.categoryReferenceBack}
        onClick={goBack}
        aria-label="이전 화면으로 돌아가기"
      />

      <section className={styles.categoryReferenceChoices} aria-label="게임 카테고리">
        <button
          type="button"
          className={`${styles.categoryReferenceChoice} ${styles.categoryReferenceFlower}`}
          aria-label="무궁화 꽃, 준비중"
          aria-haspopup="dialog"
          onClick={() => setShowComingSoon(true)}
        >
          <img className={`${styles.categoryReferenceCardImage} ${styles.categoryReferenceFlowerImage}`} src={gameMenuReference} alt="" aria-hidden="true" />
        </button>
        <Link
          className={`${styles.categoryReferenceChoice} ${styles.categoryReferenceBlock}`}
          to="block"
          aria-label="프링글수 선택"
        >
          <img className={`${styles.categoryReferenceCardImage} ${styles.categoryReferenceBlockImage}`} src={gameMenuReference} alt="" aria-hidden="true" />
        </Link>
      </section>

      {showComingSoon ? (
        <div className={styles.comingSoonBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowComingSoon(false); }}>
          <section className={styles.comingSoonDialog} role="dialog" aria-modal="true" aria-labelledby="coming-soon-title">
            <button type="button" className={styles.comingSoonClose} aria-label="팝업 닫기" onClick={() => setShowComingSoon(false)}><X aria-hidden="true" size={20} /></button>
            <Sparkles className={styles.comingSoonSparkle} aria-hidden="true" size={30} />
            <img src={gameMenuOtter} alt="" />
            <h2 id="coming-soon-title">수달이 개발중...</h2>
            <p>조금만 기다려 주세요!<br />더 재미있는 수어 게임을 만들고 있어요.</p>
            <button type="button" className={styles.comingSoonConfirm} onClick={() => setShowComingSoon(false)}>기다릴게!</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
