import { ArrowLeft, Construction } from "lucide-react";
import { Link } from "react-router-dom";

import styles from "../../shared/GameModule.module.css";

export function LineRaceLobbyPlaceholderPage() {
  return (
    <main className={styles.placeholder}>
      <span className={styles.placeholderIcon}><Construction aria-hidden="true" size={38} /></span>
      <h1>지문자 턴 배틀</h1>
      <p>대전 로비를 개발 중입니다. 다음 단계에서 공개방, 방 생성, 코드 참가와 봇 연습을 추가합니다.</p>
      <Link to=".."><ArrowLeft aria-hidden="true" size={17} />게임 선택으로 돌아가기</Link>
    </main>
  );
}
