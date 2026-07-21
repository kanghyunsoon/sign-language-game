package backend.ssafy.suhwa.game.scheduler;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** CLOSED 상태로 5분 경과한 게임방을 주기적으로 삭제한다(FR-024, research.md #3). */
@Component
@RequiredArgsConstructor
public class GameRoomCleanupScheduler {

    private static final Duration RETENTION = Duration.ofMinutes(5);

    private final GameRoomRepository gameRoomRepository;

    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void cleanupClosedRooms() {
        LocalDateTime threshold = LocalDateTime.now().minus(RETENTION);
        List<GameRoom> targets =
                gameRoomRepository.findByStatusAndUpdatedAtBefore(GameRoomStatus.CLOSED, threshold);
        if (!targets.isEmpty()) {
            gameRoomRepository.deleteAll(targets);
        }
    }
}
