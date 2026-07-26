package backend.ssafy.suhwa.game.scheduler;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.realtime.RoomLiveState;
import backend.ssafy.suhwa.game.realtime.RoomParticipantRegistry;
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
    private final RoomParticipantRegistry roomParticipantRegistry;
    private final long waitingRoomRetentionMinutes;

    public GameRoomCleanupScheduler(
            GameRoomRepository gameRoomRepository,
            RoomParticipantRegistry roomParticipantRegistry,
            @Value("${game.room.waiting-room-retention-minutes}") long waitingRoomRetentionMinutes) {
        this.gameRoomRepository = gameRoomRepository;
        this.roomParticipantRegistry = roomParticipantRegistry;
        this.waitingRoomRetentionMinutes = waitingRoomRetentionMinutes;
    }

    @Scheduled(fixedDelay = 60_000)
    @Transactional
    public void cleanupStaleRooms() {
        LocalDateTime now = LocalDateTime.now();
        List<GameRoom> targets = new ArrayList<>();
        targets.addAll(gameRoomRepository.findByStatusAndUpdatedAtBefore(
                GameRoomStatus.CLOSED, now.minus(CLOSED_RETENTION)));
        for (GameRoom room : gameRoomRepository.findByStatusAndUpdatedAtBefore(
                GameRoomStatus.WAITING, now.minusMinutes(waitingRoomRetentionMinutes))) {
            // 보관 기간을 넘겼어도 실시간 연결이 살아있는(confirmed) 참가자가 있으면 방치가 아니다
            // (FR-030, US15/T069) — DB 타임스탬프만으로는 이 상태를 알 수 없어 레지스트리를 함께 본다.
            if (!hasConfirmedLiveParticipant(room.getId())) {
                targets.add(room);
            }
        }
        if (!targets.isEmpty()) {
            // 개별 DELETE(N+1) 대신 단일 벌크 DELETE(... WHERE id IN (...))로 정리한다(FR-013).
            List<Long> ids = targets.stream().map(GameRoom::getId).toList();
            gameRoomRepository.deleteAllByIdIn(ids);
        }
    }

    private boolean hasConfirmedLiveParticipant(Long roomId) {
        RoomLiveState state = roomParticipantRegistry.getRoom(roomId);
        return state != null && state.hasConfirmedParticipant();
    }
}
