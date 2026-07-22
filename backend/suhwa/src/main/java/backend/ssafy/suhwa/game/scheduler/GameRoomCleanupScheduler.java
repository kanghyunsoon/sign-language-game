package backend.ssafy.suhwa.game.scheduler;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * CLOSED 상태로 5분 경과한 방과, 설정된 보관 기간을 초과해 방치된 WAITING 방을 주기적으로
 * 삭제한다(FR-004/FR-024, research.md #4). IN_PROGRESS 방은 어떤 경우에도 대상에서 제외한다.
 */
@Component
public class GameRoomCleanupScheduler {

    private static final Duration CLOSED_RETENTION = Duration.ofMinutes(5);

    private final GameRoomRepository gameRoomRepository;
    private final long waitingRoomRetentionMinutes;

    public GameRoomCleanupScheduler(
            GameRoomRepository gameRoomRepository,
            @Value("${game.room.waiting-room-retention-minutes}") long waitingRoomRetentionMinutes) {
        this.gameRoomRepository = gameRoomRepository;
        this.waitingRoomRetentionMinutes = waitingRoomRetentionMinutes;
    }

    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void cleanupStaleRooms() {
        LocalDateTime now = LocalDateTime.now();
        List<GameRoom> targets = new ArrayList<>();
        targets.addAll(gameRoomRepository.findByStatusAndUpdatedAtBefore(
                GameRoomStatus.CLOSED, now.minus(CLOSED_RETENTION)));
        targets.addAll(gameRoomRepository.findByStatusAndUpdatedAtBefore(
                GameRoomStatus.WAITING, now.minusMinutes(waitingRoomRetentionMinutes)));
        if (!targets.isEmpty()) {
            gameRoomRepository.deleteAll(targets);
        }
    }
}
