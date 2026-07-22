package backend.ssafy.suhwa.game.scheduler;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class GameRoomStartupReconcilerTest {

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Test
    void reconcileOnStartup_closesWaitingAndInProgressRooms_butNotAlreadyClosed() {
        GameRoomStartupReconciler reconciler = new GameRoomStartupReconciler(gameRoomRepository);

        GameRoom waiting = gameRoomRepository.save(
                GameRoom.builder().roomCode("WAIT001").hostUserId(1L).build());

        GameRoom inProgress = gameRoomRepository.save(
                GameRoom.builder().roomCode("PROG001").hostUserId(2L).build());
        inProgress.start();
        gameRoomRepository.saveAndFlush(inProgress);

        GameRoom alreadyClosed = gameRoomRepository.save(
                GameRoom.builder().roomCode("CLOS0001").hostUserId(3L).build());
        alreadyClosed.close();
        gameRoomRepository.saveAndFlush(alreadyClosed);

        reconciler.reconcileOnStartup();

        assertThat(gameRoomRepository.findById(waiting.getId()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
        assertThat(gameRoomRepository.findById(inProgress.getId()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
        assertThat(gameRoomRepository.findById(alreadyClosed.getId()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
    }
}
