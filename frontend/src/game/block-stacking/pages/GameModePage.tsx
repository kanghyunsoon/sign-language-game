import { useEffect, useState } from "react";
import { ArrowLeft, Hand, House, Radio, Sparkles, Swords, Trophy, UserRound, Zap } from "lucide-react";
import { Link } from "react-router-dom";

import modeBackground from "../assets/game-mode-background-2d.png";
import { useGameModuleContext } from "../../app/GameModuleContext";
import styles from "../../shared/GameModule.module.css";

const MODE_CANVAS_WIDTH = 1280;
const MODE_CANVAS_HEIGHT = 720;

export function GameModePage() {
  const { user } = useGameModuleContext();
  const [pageScale, setPageScale] = useState(1);

  useEffect(() => {
    const updatePageScale = () => {
      setPageScale(Math.min(
        window.innerWidth / MODE_CANVAS_WIDTH,
        window.innerHeight / MODE_CANVAS_HEIGHT,
      ));
    };

    updatePageScale();
    window.addEventListener("resize", updatePageScale);
    return () => window.removeEventListener("resize", updatePageScale);
  }, []);

  return (
    <main
      className={`${styles.modePage} ${styles.tetrisModePage} ${styles.modePage2d}`}
      data-fixed-mode-canvas="true"
      style={{ transform: `translate(-50%, -50%) scale(${pageScale})` }}
    >
      <img className={styles.mode2dBackground} src={modeBackground} alt="" aria-hidden="true" />
      <div className={styles.mode2dDecor} aria-hidden="true">
        <span className={`${styles.mode2dBlock} ${styles.mode2dBlockBlue}`}><i /><i /><i /></span>
        <span className={`${styles.mode2dBlock} ${styles.mode2dBlockPurple}`}><i /><i /><i /></span>
        <span className={`${styles.mode2dBlock} ${styles.mode2dBlockGreen}`}><i /><i /><i /></span>
        <span className={`${styles.mode2dBlock} ${styles.mode2dBlockYellow}`}><i /><i /></span>
      </div>

      <header className={styles.tetrisModeHeader}>
        <Link className={styles.modeBackButton} to=".." aria-label="게임 선택으로 돌아가기"><ArrowLeft aria-hidden="true" size={26} /></Link>
        <Link className={styles.modeHomeButton} to="/main" aria-label="메인 화면으로 이동"><House aria-hidden="true" size={23} /></Link>
        <div className={styles.modeTitleBlock}>
          <span><LayersMark /> BLOCK STACK</span>
          <h1>모드 선택</h1>
          <p>지문자를 맞혀 블록을 쌓고, 원하는 플레이 방식을 선택하세요!</p>
        </div>
        <span className={styles.modeUserBadge}>{user.displayName}</span>
      </header>

      <section className={styles.modeArena} aria-label="블록 쌓기 모드 선택">
        <Link className={`${styles.modeChoiceCard} ${styles.soloChoice}`} to="../solo" aria-label="솔로 게임 시작">
          <span className={styles.modeChoiceTopline}><b>SOLO</b><em>블록을 쌓아 결승선으로</em></span>
          <span className={styles.modeChoiceIcon}><UserRound aria-hidden="true" size={36} /></span>
          <div className={styles.modeChoiceHeading}>
            <small>정확하게 쌓아 결승선까지</small>
            <h2>솔로 게임</h2>
            <p>제시된 지문자를 맞혀 물리 블록을 차곡차곡 쌓고, 결승선 도달 시간을 단축해 보세요.</p>
          </div>
          <ul className={styles.modeFeatureList}>
            <li><Hand aria-hidden="true" size={18} /> 실시간 지문자 인식</li>
            <li><Zap aria-hidden="true" size={18} /> 물리 블록 쌓기</li>
            <li><Trophy aria-hidden="true" size={18} /> 최단 시간 기록</li>
          </ul>
          <div className={styles.modeMiniStats}><span><small>플레이어</small><strong>혼자</strong></span><span><small>목표</small><strong>결승선 도달</strong></span></div>
          <span className={styles.modeChoiceAction}>게임 시작 <Zap aria-hidden="true" size={18} /></span>
        </Link>

        <Link className={`${styles.modeChoiceCard} ${styles.battleChoice}`} to="../battle" aria-label="실시간 1대1 게임 찾기">
          <span className={styles.modeChoiceTopline}><b>1 VS 1</b><em>먼저 쌓아 결승선 도달</em></span>
          <span className={styles.modeChoiceIcon}><Swords aria-hidden="true" size={36} /></span>
          <div className={styles.modeChoiceHeading}>
            <small>같은 규칙으로 겨루는 실시간 승부</small>
            <h2>실시간 1대1</h2>
            <p>제시된 지문자를 맞혀 블록을 쌓고, 상대보다 먼저 결승선에 도달해 승리하세요.</p>
          </div>
          <ul className={styles.modeFeatureList}>
            <li><Radio aria-hidden="true" size={18} /> 공통 목표 실시간 경쟁</li>
            <li><Swords aria-hidden="true" size={18} /> 빠른 인식으로 블록 쌓기</li>
            <li><Trophy aria-hidden="true" size={18} /> 결승선 선착순 승부</li>
          </ul>
          <div className={styles.modeMiniStats}><span><small>플레이어</small><strong>2명</strong></span><span><small>목표</small><strong>먼저 결승선 도달</strong></span></div>
          <span className={styles.modeChoiceAction}>게임방 찾기 <Swords aria-hidden="true" size={18} /></span>
        </Link>
      </section>

      <aside className={styles.modeTip}><Sparkles aria-hidden="true" size={19} /><strong>게임 TIP</strong><span>지문자를 정확히 표현하면 블록이 떨어져요. 균형을 잡아 차곡차곡 쌓아보세요!</span></aside>
    </main>
  );
}

function LayersMark() {
  return <span className={styles.layersMark} aria-hidden="true"><i /><i /><i /></span>;
}
