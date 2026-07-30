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
@Table(name = "practice_sessions")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PracticeSession {

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

    @Builder
    public PracticeSession(Long userId) {
        if (userId == null) {
            throw new IllegalArgumentException("userId must not be null");
        }
        this.userId = userId;
    }

    public boolean isCompleted() {
        return completedAt != null;
    }

    public void complete(LocalDateTime completedAt) {
        if (completedAt == null) {
            throw new IllegalArgumentException("completedAt must not be null");
        }
        if (isCompleted()) {
            throw new IllegalStateException("practice session is already completed");
        }
        this.completedAt = completedAt;
    }
}
