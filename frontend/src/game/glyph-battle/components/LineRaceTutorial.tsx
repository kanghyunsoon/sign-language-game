import styles from "./LineRaceRoom.module.css";

export function LineRaceTutorial() {
  return <details className={styles.panel} open><summary><strong>게임 방법</strong></summary><ol>
    <li>양쪽이 지문자 기술을 하나씩 비공개로 선택합니다.</li>
    <li>각진 자음은 획 베기, 모음은 공명, ㅋ·ㅌ·ㅍ은 방패, ㅇ·ㅁ은 낮은 확률의 결계입니다.</li>
    <li>획은 결에, 결은 울림에, 울림은 획에 강합니다.</li>
    <li>각 턴은 10초이며, 두 선택이 확정되면 지문자 기술이 직접 날아가 피해·방패·집중력을 판정합니다.</li>
    <li>상대 체력을 먼저 0으로 만드는 쪽이 라운드를 얻고, 두 라운드를 먼저 이기면 승리합니다.</li>
  </ol></details>;
}
