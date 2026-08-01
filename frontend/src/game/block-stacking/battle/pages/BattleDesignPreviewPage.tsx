import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { useGameModuleContext } from "../../../app/GameModuleContext";
import letterOtter from "../../assets/solo-letter-otter.png";
import startTitle from "../../assets/solo-start-title.png";
import { BATTLE_DANGER_LINE_RATIO } from "../core/BattleRuntimeConfig";
import styles from "../battle.module.css";

const BATTLE_PREVIEW_CANVAS_WIDTH = 1680;
const BATTLE_PREVIEW_CANVAS_HEIGHT = 945;

function PreviewBoard({ title, remote = false }: { title: string; remote?: boolean }) {
  return (
    <section className={[styles.boardPanel, remote ? styles.remoteBoardPanel : ""].filter(Boolean).join(" ")}>
      <header>
        <div><h2>{title}</h2></div>
      </header>
      <div className={styles.boardPlayArea}>
        <div className={styles.previewBoardSurface} aria-hidden="true">
          <i className={styles.previewCloudOne} /><i className={styles.previewCloudTwo} /><i className={styles.previewCloudThree} />
          <i className={styles.previewSun} /><i className={styles.previewHill} />
          {remote ? <><b className={styles.previewGlyphOne}>ㅁ</b><b className={styles.previewGlyphTwo}>ㅜ</b></> : <><b className={styles.previewGlyphOne}>ㄴ</b><b className={styles.previewGlyphTwo}>ㅣ</b></>}
        </div>
        <span className={styles.boardFinishLine} style={{ top: `${BATTLE_DANGER_LINE_RATIO * 100}%` }} aria-hidden="true" />
      </div>
    </section>
  );
}

function PreviewCamera({ name, recognition }: { name: string; recognition?: string }) {
  return <section className={styles.duelCameraCard}>
    <header><div><strong>{name} CAM</strong></div><em className={styles.recordingIndicator}>REC</em></header>
    <div className={[styles.duelCameraViewport, styles.previewCameraViewport].join(" ")}>
      <div className={styles.previewCameraGrid} aria-hidden="true"><i /><i /><i /><i /></div>
      <span className={styles.previewCameraLabel}>LIVE PREVIEW</span>
      {recognition ? <div className={styles.recognitionBadge}><span>현재 인식</span><strong>{recognition}</strong><small>92%</small></div> : null}
    </div>
  </section>;
}

/** Development-only visual review route. It deliberately has no room, camera, AI, or WebRTC side effects. */
export function BattleDesignPreviewPage() {
  const { user } = useGameModuleContext();
  const [pageScale, setPageScale] = useState(1);

  useEffect(() => {
    const updatePageScale = () => {
      setPageScale(Math.min(
        window.innerWidth / BATTLE_PREVIEW_CANVAS_WIDTH,
        window.innerHeight / BATTLE_PREVIEW_CANVAS_HEIGHT,
      ));
    };
    updatePageScale();
    window.addEventListener("resize", updatePageScale);
    return () => window.removeEventListener("resize", updatePageScale);
  }, []);

  return <main
    className={`${styles.page} ${styles.battleFixedPage} ${styles.battlePreviewPage}`}
    data-fixed-battle-game-canvas="true"
    style={{ transform: `translate(-50%, -50%) scale(${pageScale})` }}
  >
    <header className={styles.topbar}>
      <div className={styles.battleTitleGroup}>
        <Link to="/game/battle" className={styles.battleBackButton} aria-label="대기방으로 돌아가기"><ArrowLeft aria-hidden="true" size={20} /></Link>
        <h1 className={styles.battleHeaderLogo}><img src={startTitle} alt="프링글수" /></h1>
      </div>
      <div className={styles.battleHeaderMeta}>
        <div className={styles.battleModeBadge}>1 VS 1 · FINISH LINE</div>
        <div className={styles.previewActions}><span>DESIGN PREVIEW</span></div>
      </div>
    </header>
    <div className={styles.duelLayout}>
      <section className={styles.duelStage} aria-label="1대1 게임판 디자인 프리뷰">
        <div className={styles.duelStageHeading}><span>1 VS 1 · SKY LETTER STAGE</span><span>ROOM PREVIEW</span></div>
        <div className={styles.duelBoards}>
          <div className={styles.sharedBattleSky} aria-hidden="true">
            <i className={styles.sharedNightSky}/><i className={[styles.sharedCelestial, styles.sharedSun].join(" ")}/><i className={[styles.sharedCelestial, styles.sharedMoon].join(" ")}/><i className={styles.sharedShootingStar}/>
            <i className={[styles.sharedCloud, styles.sharedCloudOne].join(" ")}/><i className={[styles.sharedCloud, styles.sharedCloudTwo].join(" ")}/><i className={[styles.sharedCloud, styles.sharedCloudThree].join(" ")}/>
            <i className={styles.sharedHills}/><span className={styles.sharedFireflies}><i/><i/><i/><i/><i/></span>
          </div>
          <PreviewBoard title={user.userId || user.displayName} />
          <PreviewBoard title="aass" remote />
        </div>
        <div className={styles.sharedTargetOtter} aria-label="공유 목표 지문자 ㄱ">
          <img src={letterOtter} alt="" draggable={false} />
          <strong>ㄱ</strong><span className={styles.sharedTargetHint}>먼저 맞히면 내 보드에 떨어져요!</span>
        </div>
      </section>
      <aside className={styles.duelCameraRail} aria-label="카메라 디자인 프리뷰">
        <PreviewCamera name={user.userId || user.displayName} recognition="ㄱ" />
        <PreviewCamera name="aass" />
      </aside>
    </div>
  </main>;
}
