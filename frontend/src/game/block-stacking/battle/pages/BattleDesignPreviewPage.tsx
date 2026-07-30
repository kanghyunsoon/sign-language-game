import { Link } from "react-router-dom";

import { useGameModuleContext } from "../../../app/GameModuleContext";
import letterOtter from "../../assets/solo-letter-otter.png";
import styles from "../battle.module.css";

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
  return <main className={`${styles.page} ${styles.battleFixedPage} ${styles.battlePreviewPage}`}>
    <header className={styles.topbar}>
      <div><h1>1:1 지문자 대전</h1><p>디자인 프리뷰 · 실시간 연결 없음</p></div>
      <div className={styles.previewActions}><Link to="/game/battle">대기방 보기</Link><span>PREVIEW</span></div>
    </header>
    <div className={styles.duelLayout}>
      <section className={styles.duelStage} aria-label="1대1 게임판 디자인 프리뷰">
        <div className={styles.duelBoards}>
          <PreviewBoard title={user.userId || user.displayName} />
          <PreviewBoard title="aass" remote />
        </div>
        <div className={styles.sharedTargetOtter} aria-label="공유 목표 지문자 ㄱ">
          <img src={letterOtter} alt="" draggable={false} />
          <strong>ㄱ</strong><span>먼저 맞히면 내 보드에 떨어져요!</span>
        </div>
      </section>
      <aside className={styles.duelCameraRail} aria-label="카메라 디자인 프리뷰">
        <PreviewCamera name={user.userId || user.displayName} recognition="ㄱ" />
        <PreviewCamera name="aass" />
      </aside>
    </div>
  </main>;
}
