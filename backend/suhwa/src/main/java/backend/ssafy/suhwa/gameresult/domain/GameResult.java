package backend.ssafy.suhwa.gameresult.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 세 게임 종류(지문자 1:1 대전/테트리스 대전/테트리스 솔로) 공통 결과 기록 — 랭킹 집계 원본(data-model.md).
 * 대전 모드는 승자 score=1, 패자 score=0 행을 함께 남기고(무승부는 기록 없음), 솔로는 보고할 때마다
 * 실제 점수를 그대로 남긴다(research.md #5). insert-only이며 갱신되지 않는다.
 */
@Entity
@Table(name = "game_results")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GameResult {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(name = "game_type", nullable = false, length = 20)
    private GameResultType gameType;

    @Column(nullable = false)
    private int score;

    @Column(name = "solo_session_id", unique = true, length = 36)
    private String soloSessionId;

    @Column(name = "play_duration_ms")
    private Long playDurationMs;

    @Column(name = "recorded_at", nullable = false)
    private LocalDateTime recordedAt;

    @Builder
    public GameResult(
            Long userId,
            GameResultType gameType,
            int score,
            String soloSessionId,
            Long playDurationMs) {
        this.userId = userId;
        this.gameType = gameType;
        this.score = score;
        this.soloSessionId = soloSessionId;
        this.playDurationMs = playDurationMs;
        this.recordedAt = LocalDateTime.now();
    }
}
