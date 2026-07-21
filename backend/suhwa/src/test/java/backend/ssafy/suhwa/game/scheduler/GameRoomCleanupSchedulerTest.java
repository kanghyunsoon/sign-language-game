package backend.ssafy.suhwa.game.scheduler;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.game.domain.GameRoom;
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
        GameRoomCleanupScheduler scheduler = new GameRoomCleanupScheduler(gameRoomRepository);

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

        scheduler.cleanupClosedRooms();

        assertThat(gameRoomRepository.findById(staleClosed.getId())).isEmpty();
        assertThat(gameRoomRepository.findById(recentClosed.getId())).isPresent();
        assertThat(gameRoomRepository.findById(waiting.getId())).isPresent();
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
