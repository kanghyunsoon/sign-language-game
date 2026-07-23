import { ArrowLeft, Bot, Hand, Radio, Sparkles, Swords, Trophy, UserRound, Zap } from "lucide-react";
import { Link } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import styles from "../../shared/GameModule.module.css";

export function GameModePage() {
  const { user } = useGameModuleContext();
  return (
    <main className={`${styles.modePage} ${styles.tetrisModePage}`}>
      <div className={`${styles.modeCloud} ${styles.modeCloudLeft}`} aria-hidden="true" />
      <div className={`${styles.modeCloud} ${styles.modeCloudRight}`} aria-hidden="true" />
      <div className={`${styles.fallingBlock} ${styles.blockOne}`} aria-hidden="true"><i /><i /><i /><i /></div>
      <div className={`${styles.fallingBlock} ${styles.blockTwo}`} aria-hidden="true"><i /><i /><i /><i /></div>
      <div className={styles.arcadeBackdrop} aria-hidden="true">
        <span className={`${styles.backdropCounter} ${styles.scoreCounter}`}><small>HIGH SCORE</small><strong>00840</strong></span>
        <span className={`${styles.backdropCounter} ${styles.levelCounter}`}><small>LEVEL</small><strong>01</strong></span>
        <span className={styles.nextPiecePanel}><small>NEXT</small><b className={styles.shapeGiyeok}><i /><i /><i /><i /></b></span>
        <span className={styles.backdropCombo}><strong>x4</strong><small>COMBO</small></span>
        <span className={`${styles.pixelStar} ${styles.pixelStarOne}`} />
        <span className={`${styles.pixelStar} ${styles.pixelStarTwo}`} />
        <span className={`${styles.pixelStar} ${styles.pixelStarThree}`} />
        <div className={`${styles.backdropTetromino} ${styles.backdropTetrominoOne} ${styles.shapeU}`}><i /><i /><i /><i /></div>
        <div className={`${styles.backdropTetromino} ${styles.backdropTetrominoTwo} ${styles.shapeDigeut}`}><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className={`${styles.backdropTetromino} ${styles.backdropTetrominoThree} ${styles.shapeHieut}`}><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
        <div className={`${styles.sideBlockStack} ${styles.leftBlockStack} ${styles.shapeNieun}`}><i /><i /><i /><i /></div>
        <div className={`${styles.sideBlockStack} ${styles.rightBlockStack} ${styles.shapeO}`}><i /><i /><i /><i /></div>
      </div>

      <header className={styles.tetrisModeHeader}>
        <Link className={styles.modeBackButton} to=".." aria-label="게임 선택으로 돌아가기"><ArrowLeft aria-hidden="true" size={20} /></Link>
        <div className={styles.modeTitleBlock}>
          <span><LayersMark /> BLOCK STACK</span>
          <h1 aria-label="지문자 테트리수">
            지문자 테트리
            <span className={styles.titleSu} aria-hidden="true">
              <i>ㅅ</i>
              <i>ㅜ</i>
            </span>
            <span className={styles.visuallyHidden}>수</span>
          </h1>
          <p>손끝으로 블록을 깨고, 나만의 최고 기록에 도전하세요!</p>
        </div>
        <span className={styles.modeUserBadge}>{user.displayName}</span>
      </header>

      <section className={styles.modeArena} aria-label="지문자 테트리수 모드 선택">
        <div className={styles.modeArenaHud} aria-hidden="true"><span>SELECT MODE</span><strong>01 / 02</strong></div>
        <Link className={`${styles.modeChoiceCard} ${styles.soloChoice}`} to="../solo" aria-label="솔로 게임 시작">
          <span className={styles.modeChoiceTopline}><b>SOLO</b><em>혼자서 집중!</em></span>
          <span className={styles.modeChoiceIcon}><UserRound aria-hidden="true" size={34} /></span>
          <div className={styles.modeChoiceHeading}>
            <small>나의 한계를 넘어라</small>
            <h2>솔로 게임</h2>
            <p>AI가 인식한 지문자로 같은 블록을 빠르게 제거해 최고 기록을 만드세요.</p>
          </div>
          <ul className={styles.modeFeatureList}>
            <li><Hand aria-hidden="true" size={17} /> 실시간 지문자 인식</li>
            <li><Zap aria-hidden="true" size={17} /> 연속 성공 COMBO</li>
            <li><Trophy aria-hidden="true" size={17} /> 개인 최고 기록 도전</li>
          </ul>
          <div className={styles.modeMiniStats}><span><small>플레이</small><strong>혼자</strong></span><span><small>추천</small><strong>기록 도전</strong></span></div>
          <span className={styles.modeChoiceAction}>솔로 시작 <Zap aria-hidden="true" size={17} /></span>
          <span className={styles.comboBurst} aria-hidden="true">COMBO!</span>
        </Link>

        <Link className={`${styles.modeChoiceCard} ${styles.battleChoice}`} to="../battle" aria-label="실시간 1대1 게임 찾기">
          <span className={styles.modeChoiceTopline}><b>1 VS 1</b><em>승부는 지금!</em></span>
          <span className={styles.modeChoiceIcon}><Swords aria-hidden="true" size={34} /></span>
          <div className={styles.modeChoiceHeading}>
            <small>상대보다 빠르고 정확하게</small>
            <h2>실시간 1대1</h2>
            <p>같은 블록판에서 상대와 겨루고 콤보 공격으로 흐름을 뒤집으세요.</p>
          </div>
          <ul className={styles.modeFeatureList}>
            <li><Radio aria-hidden="true" size={17} /> 실시간 온라인 매치</li>
            <li><Swords aria-hidden="true" size={17} /> 콤보 공격과 방해 블록</li>
            <li><Bot aria-hidden="true" size={17} /> 연습 봇으로 준비 가능</li>
          </ul>
          <div className={styles.modeMiniStats}><span><small>플레이</small><strong>2명</strong></span><span><small>목표</small><strong>먼저 생존</strong></span></div>
          <span className={styles.modeChoiceAction}>게임방 찾기 <Swords aria-hidden="true" size={17} /></span>
          <Sparkles className={styles.battleSparkle} aria-hidden="true" size={30} />
        </Link>
      </section>

      <aside className={styles.modeTip}><Sparkles aria-hidden="true" size={17} /><strong>게임 TIP</strong><span>카드에 마우스를 올려 각 모드의 게임 효과를 확인해 보세요!</span></aside>
    </main>
  );
}

function LayersMark() {
  return <span className={styles.layersMark} aria-hidden="true"><i /><i /><i /></span>;
}
