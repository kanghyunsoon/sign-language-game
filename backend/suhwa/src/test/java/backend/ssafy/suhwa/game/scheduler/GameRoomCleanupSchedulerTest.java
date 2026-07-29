package backend.ssafy.suhwa.game.scheduler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.realtime.RoomParticipantRegistry;
import backend.ssafy.suhwa.game.realtime.RoomRealtimeNotifier;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jpa.test.autoconfigure.TestEntityManager;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class GameRoomCleanupSchedulerTest {

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Autowired
    private TestEntityManager entityManager;

    @Test
    void cleanup_deletesOnlyStaleClosedRooms() {
        GameRoomCleanupScheduler scheduler =
                new GameRoomCleanupScheduler(gameRoomRepository, new RoomParticipantRegistry(), mock(RoomRealtimeNotifier.class), 30);

        GameRoom staleClosed = gameRoomRepository.save(
                GameRoom.builder().roomCode("STALE1").hostUserId(1L).build());
        staleClosed.close();
        gameRoomRepository.saveAndFlush(staleClosed);
        backdateUpdatedAt(staleClosed.getId(), LocalDateTime.now().minusMinutes(10));

        GameRoom recentClosed = gameRoomRepository.save(
                GameRoom.builder().roomCode("RECENT1").hostUserId(2L).build());
        recentClosed.close();
        gameRoomRepository.saveAndFlush(recentClosed);

        GameRoom waiting = gameRoomRepository.save(
                GameRoom.builder().roomCode("WAIT001").hostUserId(3L).build());
        entityManager.flush();
        entityManager.clear();

        scheduler.cleanupStaleRooms();

        assertThat(gameRoomRepository.findById(staleClosed.getId())).isEmpty();
        assertThat(gameRoomRepository.findById(recentClosed.getId())).isPresent();
        assertThat(gameRoomRepository.findById(waiting.getId())).isPresent();
    }

    @Test
    void cleanup_deletesStaleWaitingRoomsButKeepsRecentWaitingAndInProgress() {
        GameRoomCleanupScheduler scheduler =
                new GameRoomCleanupScheduler(gameRoomRepository, new RoomParticipantRegistry(), mock(RoomRealtimeNotifier.class), 30);

        GameRoom staleWaiting = gameRoomRepository.save(
                GameRoom.builder().roomCode("SWAIT1").hostUserId(1L).build());
        gameRoomRepository.saveAndFlush(staleWaiting);
        backdateUpdatedAt(staleWaiting.getId(), LocalDateTime.now().minusMinutes(31));

        GameRoom recentWaiting = gameRoomRepository.save(
                GameRoom.builder().roomCode("RWAIT1").hostUserId(2L).build());

        GameRoom staleInProgress = gameRoomRepository.save(
                GameRoom.builder().roomCode("SPROG1").hostUserId(3L).build());
        staleInProgress.start();
        gameRoomRepository.saveAndFlush(staleInProgress);
        backdateUpdatedAt(staleInProgress.getId(), LocalDateTime.now().minusMinutes(60));
        entityManager.flush();
        entityManager.clear();

        scheduler.cleanupStaleRooms();

        assertThat(gameRoomRepository.findById(staleWaiting.getId())).isEmpty();
        assertThat(gameRoomRepository.findById(recentWaiting.getId())).isPresent();
        assertThat(gameRoomRepository.findById(staleInProgress.getId()))
                .as("IN_PROGRESS 방은 아무리 오래돼도 정리 대상이 아니어야 한다")
                .isPresent();
    }

    @Test
    void cleanup_keepsStaleWaitingRoomWithConfirmedLiveParticipant() {
        RoomParticipantRegistry registry = new RoomParticipantRegistry();
        GameRoomCleanupScheduler scheduler = new GameRoomCleanupScheduler(gameRoomRepository, registry, mock(RoomRealtimeNotifier.class), 30);

        GameRoom staleWaitingButConnected = gameRoomRepository.save(
                GameRoom.builder().roomCode("SWAIT2").hostUserId(1L).build());
        gameRoomRepository.saveAndFlush(staleWaitingButConnected);
        backdateUpdatedAt(staleWaitingButConnected.getId(), LocalDateTime.now().minusMinutes(31));
        entityManager.flush();
        entityManager.clear();

        registry.getOrCreateRoom(staleWaitingButConnected.getId())
                .getOrCreateParticipant(1L)
                .setConfirmed(true);

        scheduler.cleanupStaleRooms();

        assertThat(gameRoomRepository.findById(staleWaitingButConnected.getId()))
                .as("실시간 연결이 살아있는 WAITING 방은 보관 기간을 넘겨도 삭제되면 안 된다")
                .isPresent();
    }

    /**
     * updatedAt은 JPA Auditing이 매 update 시점에 now()로 덮어쓰므로, 엔티티 save()로는
     * 과거 시각을 흉내낼 수 없다. 엔티티 리스너를 우회하는 벌크 JPQL UPDATE로 직접 backdate한다.
     */
    private void backdateUpdatedAt(Long roomId, LocalDateTime updatedAt) {
        entityManager.getEntityManager()
                .createQuery("UPDATE GameRoom g SET g.updatedAt = :updatedAt WHERE g.id = :id")
                .setParameter("updatedAt", updatedAt)
                .setParameter("id", roomId)
                .executeUpdate();
        entityManager.flush();
        entityManager.clear();
    }
}
