package backend.ssafy.suhwa.learning.domain;

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
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "test_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TestSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @CreationTimestamp
    @Column(name = "started_at", nullable = false, updatable = false)
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "correct_count")
    private Integer correctCount;

    @Column(name = "total_count")
    private Integer totalCount;

    @Builder
    public TestSession(Long userId) {
        this.userId = userId;
    }

    public void complete(LocalDateTime completedAt, int correctCount, int totalCount) {
        if (completedAt == null || totalCount < 1 || correctCount < 0 || correctCount > totalCount) {
            throw new IllegalArgumentException("invalid test completion");
        }
        if (isCompleted()) {
            throw new IllegalStateException("test session is already completed");
        }
        this.completedAt = completedAt;
        this.correctCount = correctCount;
        this.totalCount = totalCount;
    }

    public boolean isCompleted() {
        return completedAt != null;
    }

    public boolean hasSameResult(int correctCount, int totalCount) {
        return isCompleted()
                && this.correctCount == correctCount
                && this.totalCount == totalCount;
    }

    public boolean passedRewardThreshold() {
        return isCompleted() && (long) correctCount * 100 >= (long) totalCount * 80;
    }
}
