import { Link } from "react-router-dom";
import styles from "../../shared/GameModule.module.css";

export function BattleResultPage() {
  return <div className={styles.placeholder}><h1>대전 결과</h1><p>대전 결과 처리는 다음 단계에서 구현합니다.</p><Link to="../../..">모드 선택으로</Link></div>;
}
