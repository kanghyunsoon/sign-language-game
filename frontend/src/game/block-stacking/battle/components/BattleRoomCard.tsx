import { Clock3, Crown, LogIn, Users } from "lucide-react";

import type { BattleRoomSummary } from "../room";
import styles from "./BattleRoomUi.module.css";

export interface BattleRoomCardProps {
  readonly room: BattleRoomSummary;
  readonly joining: boolean;
  readonly onJoin: (roomId: string) => void;
}

export function BattleRoomCard({ room, joining, onJoin }: BattleRoomCardProps) {
  return (
    <article className={styles.roomCard}>
      <header className={styles.roomCardHeader}>
        <div><span className={`${styles.statusBadge} ${styles[`status${room.status}`]}`}>{statusLabel(room.status)}</span><h2>{room.title}</h2></div>
        <span className={styles.playerCount}><Users aria-hidden="true" size={16} />{room.playerCount}/{room.maxPlayers}</span>
      </header>
      <dl className={styles.roomFacts}>
        <div><dt><Crown aria-hidden="true" size={15} />방장</dt><dd>{room.hostName}</dd></div>
        <div><dt>난이도</dt><dd>{difficultyLabel(room.difficulty)}</dd></div>
        <div><dt>출제 범위</dt><dd>{room.symbolRange.join(" · ")}</dd></div>
        <div><dt><Clock3 aria-hidden="true" size={15} />생성</dt><dd>{formatCreatedAt(room.createdAt)}</dd></div>
      </dl>
      <button type="button" className={styles.joinButton} disabled={!room.canJoin || joining} onClick={() => onJoin(room.roomId)}>
        <LogIn aria-hidden="true" size={17} />{joining ? "입장 중" : room.canJoin ? "입장" : "입장 불가"}
      </button>
    </article>
  );
}

export function statusLabel(status: BattleRoomSummary["status"]): string {
  switch (status) {
    case "WAITING": return "대기 중";
    case "FULL": return "정원 마감";
    case "COUNTDOWN": return "시작 준비";
    case "PLAYING": return "게임 중";
    case "FINISHED": return "종료";
  }
}

function difficultyLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = { EASY: "입문", BEGINNER: "입문", NORMAL: "보통", HARD: "어려움" };
  return labels[value] ?? value;
}

function formatCreatedAt(value: number | null): string {
  if (value === null) return "서버 정보 없음";
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}
