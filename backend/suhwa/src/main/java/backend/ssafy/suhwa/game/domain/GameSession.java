package backend.ssafy.suhwa.game.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "game_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GameSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "player1_id", nullable = false)
    private Long player1Id;

    @Column(name = "player2_id", nullable = false)
    private Long player2Id;

    @Column(name = "player1_score", nullable = false)
    private int player1Score;

    @Column(name = "player2_score", nullable = false)
    private int player2Score;

    @Column(name = "winner_id")
    private Long winnerId;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    @Builder
    public GameSession(
            Long player1Id, Long player2Id, int player1Score, int player2Score,
            Long winnerId, LocalDateTime startedAt, LocalDateTime endedAt) {
        this.player1Id = player1Id;
        this.player2Id = player2Id;
        this.player1Score = player1Score;
        this.player2Score = player2Score;
        this.winnerId = winnerId;
        this.startedAt = startedAt;
        this.endedAt = endedAt;
    }
}
