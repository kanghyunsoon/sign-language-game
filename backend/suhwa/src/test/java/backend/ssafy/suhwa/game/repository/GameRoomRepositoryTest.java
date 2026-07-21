package backend.ssafy.suhwa.game.repository;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class GameRoomRepositoryTest {

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Test
    void findByRoomCode_returnsMatchingRoom() {
        GameRoom saved = gameRoomRepository.save(
                GameRoom.builder().roomCode("ABC123").hostUserId(1L).build());

        Optional<GameRoom> found = gameRoomRepository.findByRoomCode("ABC123");

        assertThat(found).isPresent();
        assertThat(found.get().getId()).isEqualTo(saved.getId());
    }

    @Test
    void existsByRoomCode_detectsDuplicate() {
        gameRoomRepository.save(GameRoom.builder().roomCode("DUP001").hostUserId(1L).build());

        assertThat(gameRoomRepository.existsByRoomCode("DUP001")).isTrue();
        assertThat(gameRoomRepository.existsByRoomCode("NOPE99")).isFalse();
    }

    @Test
    void findByStatusAndUpdatedAtBefore_onlyReturnsStaleClosedRooms() {
        GameRoom fresh = gameRoomRepository.save(GameRoom.builder().roomCode("FRESH1").hostUserId(1L).build());
        fresh.close();
        gameRoomRepository.save(fresh);

        GameRoom waiting = gameRoomRepository.save(GameRoom.builder().roomCode("WAIT01").hostUserId(2L).build());

        LocalDateTime future = LocalDateTime.now().plusMinutes(10);
        List<GameRoom> staleClosed = gameRoomRepository.findByStatusAndUpdatedAtBefore(
                GameRoomStatus.CLOSED, future);

        assertThat(staleClosed).extracting(GameRoom::getId).contains(fresh.getId());
        assertThat(staleClosed).extracting(GameRoom::getId).doesNotContain(waiting.getId());
    }
}
