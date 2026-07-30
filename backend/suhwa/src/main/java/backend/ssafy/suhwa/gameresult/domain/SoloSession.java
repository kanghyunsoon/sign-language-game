package backend.ssafy.suhwa.gameresult.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "solo_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SoloSession {

    @Id
    @Column(length = 36)
    private String id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 50)
    private String difficulty;

    @Enumerated(EnumType.STRING)
    @Column(name = "play_mode", nullable = false, length = 20)
    private SoloPlayMode playMode;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "final_score")
    private Integer finalScore;

    @Column(name = "max_combo")
    private Integer maxCombo;

    @Column(name = "removed_symbol_count")
    private Integer removedSymbolCount;

    @Column(name = "play_duration_ms")
    private Long playDurationMs;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Builder
    public SoloSession(
            String id, Long userId, String difficulty, SoloPlayMode playMode, Instant startedAt) {
        this.id = id;
        this.userId = userId;
        this.difficulty = difficulty;
        this.playMode = playMode;
        this.startedAt = startedAt;
    }

    public boolean isCompleted() {
        return completedAt != null;
    }

    public void complete(
            int finalScore,
            int maxCombo,
            int removedSymbolCount,
            long playDurationMs,
            Instant endedAt,
            Instant completedAt) {
        if (isCompleted()) {
            throw new IllegalStateException("solo session is already completed");
        }
        this.finalScore = finalScore;
        this.maxCombo = maxCombo;
        this.removedSymbolCount = removedSymbolCount;
        this.playDurationMs = playDurationMs;
        this.endedAt = endedAt;
        this.completedAt = completedAt;
    }

    public boolean hasSameResult(
            int finalScore,
            int maxCombo,
            int removedSymbolCount,
            long playDurationMs,
            Instant endedAt) {
        return isCompleted()
                && this.finalScore == finalScore
                && this.maxCombo == maxCombo
                && this.removedSymbolCount == removedSymbolCount
                && this.playDurationMs == playDurationMs
                && this.endedAt.equals(endedAt);
    }
}
