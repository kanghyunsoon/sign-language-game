import { useState } from "react";
import { fixedCanvasStyle, useFixedCanvasScale } from "../../../shared/layout/fixedCanvas";
import { ArrowLeft, House, Sparkles, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import fieldBackground from "../assets/game-menu-field-bg.webp";
import menuTitle from "../assets/game-menu-title.webp";
import heroOtter from "../assets/game-menu-hero-otter.webp";
import flowerIcon from "../assets/game-menu-flower.webp";
import blockStack from "../assets/game-menu-block-stack.webp";
import blockLogo from "../assets/game-menu-block-logo.webp";
import blockOtter from "../assets/game-menu-block-otter.webp";
import gameMenuOtter from "../assets/game-menu-otter.png";
import { useGameModuleContext } from "../../app/GameModuleContext";
import styles from "../../shared/GameModule.module.css";

const CATEGORY_CANVAS_WIDTH = 1280;
const CATEGORY_CANVAS_HEIGHT = 720;

export function GameCategoryPage() {
  const canvas = useFixedCanvasScale(CATEGORY_CANVAS_WIDTH, CATEGORY_CANVAS_HEIGHT);
  const { onExit, user } = useGameModuleContext();
  const navigate = useNavigate();
  const [showComingSoon, setShowComingSoon] = useState(false);

  const goBack = () => {
    if (onExit) onExit();
    else navigate("/main");
  };

  return (
    <main
      className={`${styles.categoryPage} ${styles.categoryMenuPage}`}
      data-fixed-game-canvas="true"
      style={fixedCanvasStyle(canvas)}
    >
      <img className={styles.categoryMenuBackground} src={fieldBackground} alt="" aria-hidden="true" />

      <h1 className={styles.visuallyHidden}>수어의 달인 게임 선택</h1>

      <button
        type="button"
        className={styles.categoryMenuBack}
        onClick={goBack}
        aria-label="이전 화면으로 돌아가기"
      >
        <ArrowLeft aria-hidden="true" size={26} />
      </button>

      <Link className={styles.categoryMenuHome} to="/main" aria-label="메인 화면으로 이동">
        <House aria-hidden="true" size={23} />
      </Link>

      <span className={`game-user-chip ${styles.categoryMenuUserBadge}`}>{user.displayName}</span>

      <img className={styles.categoryMenuTitle} src={menuTitle} alt="수어의 달인" />
      <img className={styles.categoryMenuHeroOtter} src={heroOtter} alt="" aria-hidden="true" />

      <section className={styles.categoryMenuChoices} aria-label="게임 카테고리">
        <button
          type="button"
          className={`${styles.categoryMenuCard} ${styles.categoryMenuFlowerCard}`}
          aria-label="무궁화 꽃, 준비중"
          aria-haspopup="dialog"
          onClick={() => setShowComingSoon(true)}
        >
          <span className={styles.categoryMenuBadge}>준비중</span>
          <img className={styles.categoryMenuFlowerIcon} src={flowerIcon} alt="" aria-hidden="true" />
          <span className={styles.categoryMenuCardBody}>
            <strong>무궁화 꽃</strong>
            <span>
              수어 미션을 성공하고
              <br />
              결승선에 가장 먼저 도착해요!
            </span>
          </span>
        </button>

        <Link
          className={`${styles.categoryMenuCard} ${styles.categoryMenuBlockCard}`}
          to="block"
          aria-label="프링글수 선택"
        >
          <span className={`${styles.categoryMenuBadge} ${styles.categoryMenuBlockBadge}`}>SOLO · 1 VS 1</span>
          <img className={styles.categoryMenuBlockStack} src={blockStack} alt="" aria-hidden="true" />
          <span className={styles.categoryMenuCardBody}>
            <img className={styles.categoryMenuBlockLogo} src={blockLogo} alt="프링글수" />
            <span>
              화면의 지문자를 맞혀 블록을 쌓고,
              <br />
              솔로 기록과 1:1 승부에 도전하세요!
            </span>
          </span>
          <img className={styles.categoryMenuBlockOtter} src={blockOtter} alt="" aria-hidden="true" />
        </Link>
      </section>

      {showComingSoon ? (
        <div
          className={styles.comingSoonBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowComingSoon(false);
          }}
        >
          <section
            className={styles.comingSoonDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coming-soon-title"
          >
            <button
              type="button"
              className={styles.comingSoonClose}
              aria-label="팝업 닫기"
              onClick={() => setShowComingSoon(false)}
            >
              <X aria-hidden="true" size={20} />
            </button>
            <Sparkles className={styles.comingSoonSparkle} aria-hidden="true" size={30} />
            <img src={gameMenuOtter} alt="" />
            <h2 id="coming-soon-title">수달이 개발중...</h2>
            <p>
              조금만 기다려 주세요!
              <br />
              더 재미있는 수어 게임을 만들고 있어요.
            </p>
            <button type="button" className={styles.comingSoonConfirm} onClick={() => setShowComingSoon(false)}>
              기다릴게!
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
