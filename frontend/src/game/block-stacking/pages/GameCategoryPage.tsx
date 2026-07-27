import { useState } from "react";
import { ArrowLeft, Flower2, Layers3, Sparkles, Swords, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import otterCharacter from "../assets/game-menu-otter.png";
import { useGameModuleContext } from "../../app/GameModuleContext";
import styles from "../../shared/GameModule.module.css";

interface GameSelectionCard {
  readonly id: "FLOWER" | "BLOCK_STACK" | "LINE_RACE";
  readonly title: string;
  readonly description: string;
  readonly playStyle: string;
  readonly destination?: string;
  readonly featured?: boolean;
  readonly icon: typeof Layers3;
}

const CATEGORIES: readonly GameSelectionCard[] = [
  {
    id: "FLOWER",
    title: "무궁화 꽃",
    description: "수어 미션을 성공하고 결승선에 가장 먼저 도착해요!",
    playStyle: "준비중..",
    icon: Flower2,
  },
  {
    id: "BLOCK_STACK",
    title: "지문자 테트리스",
    description: "화면에 나타나는 지문자를 표현해 블록을 제거하세요!",
    playStyle: "solo · 1 VS 1",
    destination: "block",
    featured: true,
    icon: Layers3,
  },
  {
    id: "LINE_RACE",
    title: "수달 배틀",
    description: "수어를 빠르고 정확하게 표현해 상대보다 높은 점수를 얻으세요!",
    playStyle: "1 VS 1",
    destination: "turn-battle",
    icon: Swords,
  },
];

export function GameCategoryPage() {
  const { user, onExit } = useGameModuleContext();
  const navigate = useNavigate();
  const [showComingSoon, setShowComingSoon] = useState(false);
  return (
    <main className={styles.categoryPage}>
      <div className={`${styles.skyCloud} ${styles.cloudLeft}`} aria-hidden="true" />
      <div className={`${styles.skyCloud} ${styles.cloudRight}`} aria-hidden="true" />

      <header className={styles.categoryTopBar}>
        <button type="button" className={styles.categoryUtilityButton} onClick={() => { if (onExit) onExit(); else navigate("/main"); }} aria-label="이전 화면으로 돌아가기">
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <span className={styles.categoryUser}>{user.displayName}</span>
      </header>

      <section className={styles.categoryHero} aria-labelledby="game-selection-title">
        <h1 id="game-selection-title" className={styles.otterLogo} aria-label="수어의 달인">
          <span className={styles.logoYellow}>수어의</span>
          <span className={styles.logoPink}>달</span>
          <span className={styles.logoBlue}>인</span>
        </h1>
        <img className={styles.categoryOtter} src={otterCharacter} alt="수어 자세를 취하는 수달 캐릭터" />
      </section>

      <section className={styles.categoryGrid} aria-label="게임 카테고리">
        {CATEGORIES.map(({ id, title, description, playStyle, destination, featured, icon: Icon }) => {
          const content = (
            <>
              <span className={styles.categoryCardBadge}>{playStyle}</span>
              <span className={styles.categoryCardIcon}><Icon aria-hidden="true" size={28} /></span>
              <span className={styles.categoryCardCopy}><strong>{title}</strong><small>{description}</small></span>
            </>
          );
          const className = `${styles.categoryCard} ${featured ? styles.categoryCardFeatured : ""} ${destination ? "" : styles.categoryCardDisabled}`;
          return destination ? (
            <Link key={id} className={className} data-game-category={id} to={destination} aria-label={`${title} 선택`}>
              {content}
            </Link>
          ) : (
            <button key={id} type="button" className={className} data-game-category={id} aria-haspopup="dialog" onClick={() => setShowComingSoon(true)}>
              {content}
            </button>
          );
        })}
      </section>
      <p className={styles.categoryHint}>플레이할 게임 카드를 선택해 주세요.</p>

      {showComingSoon ? (
        <div className={styles.comingSoonBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowComingSoon(false); }}>
          <section className={styles.comingSoonDialog} role="dialog" aria-modal="true" aria-labelledby="coming-soon-title">
            <button type="button" className={styles.comingSoonClose} aria-label="팝업 닫기" onClick={() => setShowComingSoon(false)}><X aria-hidden="true" size={20} /></button>
            <Sparkles className={styles.comingSoonSparkle} aria-hidden="true" size={30} />
            <img src={otterCharacter} alt="" />
            <h2 id="coming-soon-title">수달이 개발중..</h2>
            <p>조금만 기다려 주세요!<br />더 재미있는 수어 게임을 만들고 있어요.</p>
            <button type="button" className={styles.comingSoonConfirm} onClick={() => setShowComingSoon(false)}>기다릴게!</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
