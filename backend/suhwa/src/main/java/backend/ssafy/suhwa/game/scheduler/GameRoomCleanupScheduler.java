package backend.ssafy.suhwa.game.scheduler;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.realtime.RoomLiveState;
import backend.ssafy.suhwa.game.realtime.RoomParticipantRegistry;
import backend.ssafy.suhwa.game.realtime.RoomRealtimeNotifier;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * CLOSED 상태로 5분 경과한 방과, 설정된 보관 기간을 초과해 방치된 WAITING 방을 주기적으로
 * 삭제한다(FR-004/FR-024, research.md #4). IN_PROGRESS 방은 어떤 경우에도 대상에서 제외한다.
 */
@Component
public class GameRoomCleanupScheduler {

    private static final Duration CLOSED_RETENTION = Duration.ofMinutes(5);

    private final GameRoomRepository gameRoomRepository;
    private final RoomParticipantRegistry roomParticipantRegistry;
    private final RoomRealtimeNotifier roomRealtimeNotifier;
    private final long waitingRoomRetentionMinutes;

    public GameRoomCleanupScheduler(
            GameRoomRepository gameRoomRepository,
            RoomParticipantRegistry roomParticipantRegistry,
            RoomRealtimeNotifier roomRealtimeNotifier,
            @Value("${game.room.waiting-room-retention-minutes}") long waitingRoomRetentionMinutes) {
        this.gameRoomRepository = gameRoomRepository;
        this.roomParticipantRegistry = roomParticipantRegistry;
        this.roomRealtimeNotifier = roomRealtimeNotifier;
        this.waitingRoomRetentionMinutes = waitingRoomRetentionMinutes;
    }

    /**
     * 전역 트랜잭션 타임아웃(3초, FR-022)은 사용자 요청 기준이라, 방이 많이 쌓였을 때의 벌크
     * 정리에는 짧다. 이 배치만 30초로 늘린다.
     */
    @Scheduled(fixedDelay = 60_000)
    @Transactional(timeout = 30)
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
            disposeDeletedRoomsAfterCommit(ids);
        }
    }

    /**
     * 삭제된 방의 실시간 자원(예약 타이머, WebSocket 세션, 레지스트리 엔트리)을 회수한다.
     * DB 행만 지우면 레지스트리 엔트리는 그대로 남아 방 수에 비례해 누적된다.
     *
     * <p>선정 대상 전체를 폐기하지 않고 <b>실제로 사라진 방만</b> 폐기한다 — 벌크 DELETE에는
     * IN_PROGRESS 방을 보호하는 조건이 있어, 선정과 삭제 사이에 게임이 시작된 방은 삭제되지 않고
     * 살아남는다. 그런 방을 폐기하면 진행 중인 대전의 연결을 끊는다.
     *
     * <p>커밋 후에 실행한다 — 롤백되면 방이 살아 있으므로 연결을 끊으면 안 된다.
     */
    private void disposeDeletedRoomsAfterCommit(List<Long> ids) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                Set<Long> survived = gameRoomRepository.findAllById(ids).stream()
                        .map(GameRoom::getId)
                        .collect(Collectors.toSet());
                ids.stream()
                        .filter(id -> !survived.contains(id))
                        .forEach(roomRealtimeNotifier::disposeRoom);
            }
        });
    }

    private boolean hasConfirmedLiveParticipant(Long roomId) {
        RoomLiveState state = roomParticipantRegistry.getRoom(roomId);
        return state != null && state.hasConfirmedParticipant();
    }
}
