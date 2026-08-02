import { Clock3, Crown, LogIn, Users } from "lucide-react";

import type { BattleRoomSummary } from "../room";
import styles from "./BattleRoomUi.module.css";

export interface BattleRoomCardProps {
  readonly room: BattleRoomSummary;
  readonly joining: boolean;
  readonly currentRoom?: boolean;
  readonly onJoin: (roomId: string) => void;
}

export function BattleRoomCard({ room, joining, currentRoom = false, onJoin }: BattleRoomCardProps) {
  return (
    <article className={styles.roomCard}>
      <header className={styles.roomCardHeader}>
        <div><span className={`${styles.statusBadge} ${styles[`status${room.status}`]}`}>{statusLabel(room.status)}</span><h2>{room.title}</h2></div>
        <span className={styles.playerCount}><Users aria-hidden="true" size={16} />{room.playerCount}/{room.maxPlayers}</span>
      </header>
      <dl className={styles.roomFacts}>
        <div><dt><Crown aria-hidden="true" size={15} />방장</dt><dd>{room.hostName}</dd></div>
        <div><dt>출제 범위</dt><dd>{symbolRangeLabel(room)}</dd></div>
        {room.createdAt !== null ? <div><dt><Clock3 aria-hidden="true" size={15} />생성</dt><dd>{formatCreatedAt(room.createdAt)}</dd></div> : null}
      </dl>
      <button type="button" className={styles.joinButton} disabled={(!room.canJoin && !currentRoom) || joining} onClick={() => onJoin(room.roomId)}>
        <LogIn aria-hidden="true" size={17} />{joining ? "확인 중" : currentRoom ? "재입장" : room.canJoin ? "입장" : "입장 불가"}
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

export function symbolRangeLabel(room: Pick<BattleRoomSummary, "difficulty" | "symbolRange">): string {
  if (room.symbolRange.length > 0) {
    if (room.symbolRange.every((symbol) => VOWELS.has(symbol))) return "모음";
    if (room.symbolRange.every((symbol) => CONSONANTS.has(symbol))) return "자음";
    return "기초 혼합";
  }

  const value = room.difficulty.trim().toUpperCase();
  if (value === "CONSONANTS") return "자음";
  if (value === "VOWELS") return "모음";
  if (value === "BASIC" || value === "기본") return "기초 혼합";
  return "기초 혼합";
}

const CONSONANTS = new Set(["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"]);
const VOWELS = new Set(["ㅏ", "ㅑ", "ㅓ", "ㅕ", "ㅗ", "ㅛ", "ㅜ", "ㅠ", "ㅡ", "ㅣ"]);

function formatCreatedAt(value: number): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}
