import { ArrowLeft, Flag, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";

import { useGameModuleContext } from "../../app/GameModuleContext";
import type { GameCategory } from "../core/GameCategory";
import styles from "../../shared/GameModule.module.css";

interface CategoryCard {
  readonly category: GameCategory;
  readonly title: string;
  readonly description: string;
  readonly playStyle: string;
  readonly destination: string;
  readonly icon: typeof Layers3;
}

const CATEGORIES: readonly CategoryCard[] = [
  {
    category: "BLOCK_STACK",
    title: "블록 쌓기",
    description: "지문자를 인식해 같은 글자를 제거하는 물리 퍼즐 게임",
    playStyle: "싱글 / 실시간 1:1",
    destination: "block",
    icon: Layers3,
  },
  {
    category: "LINE_RACE",
    title: "지문자 월드 배틀",
    description: "내 손으로 만든 글자를 날려 상대의 세계를 글자 획으로 뒤틀어 버리는 1:1 대전",
    playStyle: "실시간 1:1",
    destination: "line-race",
    icon: Flag,
  },
];

export function GameCategoryPage() {
  const { user, onExit } = useGameModuleContext();
  return (
    <main className={styles.categoryPage}>
      <header className={styles.modeHeader}>
        <div><span>손말 게임</span><h1>게임 선택</h1><p>{user.displayName}님, 플레이할 게임을 선택하세요.</p></div>
        {onExit ? <button type="button" className={styles.exitButton} onClick={onExit}><ArrowLeft aria-hidden="true" size={18} /> 나가기</button> : null}
      </header>
      <section className={styles.categoryGrid} aria-label="게임 카테고리">
        {CATEGORIES.map(({ category, title, description, playStyle, destination, icon: Icon }) => (
          <article key={category} className={styles.categoryCard} data-game-category={category}>
            <Icon aria-hidden="true" size={38} />
            <div><h2>{title}</h2><p>{description}</p></div>
            <dl><dt>플레이 방식</dt><dd>{playStyle}</dd></dl>
            <Link className={styles.categorySelect} to={destination}>선택</Link>
          </article>
        ))}
      </section>
    </main>
  );
}
