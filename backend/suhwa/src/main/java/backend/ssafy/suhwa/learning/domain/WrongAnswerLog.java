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
@Table(name = "wrong_answer_logs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WrongAnswerLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "sign_id", nullable = false)
    private Long signId;

    @CreationTimestamp
    @Column(name = "wrong_at", nullable = false, updatable = false)
    private LocalDateTime wrongAt;

    @Builder
    public WrongAnswerLog(Long userId, Long signId) {
        this.userId = userId;
        this.signId = signId;
    }
}
