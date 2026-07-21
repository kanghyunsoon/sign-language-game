import { Crown, UserRound, Users } from "lucide-react";

import type { BattleRoomParticipant } from "../room";
import styles from "./BattleRoomUi.module.css";

export interface ParticipantListProps {
  readonly participants: readonly BattleRoomParticipant[];
  readonly currentUserId: string;
  readonly maxPlayers: number;
}

export function ParticipantList({ participants, currentUserId, maxPlayers }: ParticipantListProps) {
  return (
    <section className={styles.participantPanel} aria-labelledby="participants-title">
      <header><div><Users aria-hidden="true" size={19} /><h2 id="participants-title">참가자</h2></div><strong>{participants.length}/{maxPlayers}</strong></header>
      <ul>
        {participants.map((participant) => (
          <li key={participant.userId}>
            <UserRound aria-hidden="true" size={20} />
            <div><strong>{participant.displayName}{participant.userId === currentUserId ? " (나)" : ""}</strong><span>{participant.isHost ? "방장" : "참가자"}</span></div>
            {participant.isHost ? <Crown aria-label="방장" size={19} /> : null}
          </li>
        ))}
        {Array.from({ length: Math.max(0, maxPlayers - participants.length) }, (_, index) => <li key={`empty-${index}`} className={styles.emptyParticipant}><UserRound aria-hidden="true" size={20} /><span>상대방을 기다리는 중</span></li>)}
      </ul>
    </section>
  );
}
