import { ArrowLeft, Swords, UserRound, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import styles from "../../shared/GameModule.module.css";

export function GameModePage() {
  const { user } = useGameModuleContext();
  return (
    <div className={styles.modePage}>
      <header className={styles.modeHeader}>
        <div><span>블록 쌓기</span><h1>게임 모드</h1><p>{user.displayName}님, 플레이할 모드를 선택하세요.</p></div>
        <Link className={styles.exitButton} to=".."><ArrowLeft aria-hidden="true" size={18} /> 게임 선택</Link>
      </header>
      <div className={styles.modeGrid}>
        <Link className={styles.modeOption} to="../solo"><UserRound aria-hidden="true" size={34} /><strong>싱글 게임</strong><span>AI 지문자 인식으로 혼자 연습합니다.</span></Link>
        <Link className={styles.modeOption} to="../battle"><Swords aria-hidden="true" size={34} /><strong>1:1 대전</strong><span>대전방 목록으로 이동합니다.</span></Link>
        <div className={`${styles.modeOption} ${styles.disabled}`} aria-disabled="true"><UsersRound aria-hidden="true" size={34} /><strong>협동 게임</strong><span>준비 중</span></div>
      </div>
    </div>
  );
}
