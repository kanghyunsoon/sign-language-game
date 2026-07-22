package backend.ssafy.suhwa.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.common.config.JpaAuditingConfig;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.dto.GameResultResponse;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.repository.GameSessionRepository;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Import(JpaAuditingConfig.class)
class GameRoomServiceTest {

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Autowired
    private GameSessionRepository gameSessionRepository;

    @Autowired
    private UserRepository userRepository;

    private GameRoomService gameRoomService;
    private Long hostId;
    private Long guestId;

    @BeforeEach
    void setUp() {
        gameRoomService = new GameRoomService(gameRoomRepository, gameSessionRepository, userRepository);
        hostId = userRepository.save(User.builder()
                .email("host-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("host").build())
                .getId();
        guestId = userRepository.save(User.builder()
                .email("guest-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("guest").build())
                .getId();
    }

    private GameRoom createReadyRoom() {
        GameRoom room = gameRoomService.create(hostId);
        gameRoomService.join(room.getRoomCode(), guestId);
        gameRoomService.setReady(room.getId(), hostId, true);
        gameRoomService.setReady(room.getId(), guestId, true);
        return room;
    }

    @Test
    void waitingLeave_hostLeavesWithGuestPresent_delegatesHost() {
        GameRoom room = gameRoomService.create(hostId);
        gameRoomService.join(room.getRoomCode(), guestId);

        gameRoomService.leave(room.getId(), hostId);

        GameRoom updated = gameRoomRepository.findById(room.getId()).orElseThrow();
        assertThat(updated.getHostUserId()).isEqualTo(guestId);
        assertThat(updated.getGuestUserId()).isNull();
        assertThat(updated.getStatus()).isEqualTo(GameRoomStatus.WAITING);
    }

    @Test
    void waitingLeave_lastParticipantLeaves_closesRoom() {
        GameRoom room = gameRoomService.create(hostId);

        gameRoomService.leave(room.getId(), hostId);

        assertThat(gameRoomRepository.findById(room.getId()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
    }

    @Test
    void waitingLeave_guestLeaves_freesSlotWithoutClosingRoom() {
        GameRoom room = gameRoomService.create(hostId);
        gameRoomService.join(room.getRoomCode(), guestId);

        gameRoomService.leave(room.getId(), guestId);

        GameRoom updated = gameRoomRepository.findById(room.getId()).orElseThrow();
        assertThat(updated.getGuestUserId()).isNull();
        assertThat(updated.getStatus()).isEqualTo(GameRoomStatus.WAITING);
    }

    @Test
    void inProgressLeave_voidsMatch_noSessionCreated() {
        GameRoom room = createReadyRoom();
        gameRoomService.start(room.getId(), hostId);

        gameRoomService.leave(room.getId(), guestId);

        assertThat(gameRoomRepository.findById(room.getId()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
        assertThat(gameSessionRepository.count()).isZero();
    }

    @Test
    void setReady_succeedsWhileWaiting() {
        GameRoom room = gameRoomService.create(hostId);

        GameRoom updated = gameRoomService.setReady(room.getId(), hostId, true);

        assertThat(updated.isHostReady()).isTrue();
    }

    @Test
    void setReady_rejectedWhenInProgress() {
        GameRoom room = createReadyRoom();
        gameRoomService.start(room.getId(), hostId);

        assertThatThrownBy(() -> gameRoomService.setReady(room.getId(), hostId, false))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void setReady_rejectedWhenClosed() {
        GameRoom room = gameRoomService.create(hostId);
        gameRoomService.leave(room.getId(), hostId);

        assertThatThrownBy(() -> gameRoomService.setReady(room.getId(), hostId, true))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void start_rejectsWhenNotAllReady() {
        GameRoom room = gameRoomService.create(hostId);
        gameRoomService.join(room.getRoomCode(), guestId);
        gameRoomService.setReady(room.getId(), hostId, true);

        assertThatThrownBy(() -> gameRoomService.start(room.getId(), hostId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void start_rejectsWhenCallerIsNotHost() {
        GameRoom room = createReadyRoom();

        assertThatThrownBy(() -> gameRoomService.start(room.getId(), guestId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void reportResult_computesWinnerAndUpdatesRecordsAndClosesRoom() {
        GameRoom room = createReadyRoom();
        gameRoomService.start(room.getId(), hostId);

        GameResultResponse result = gameRoomService.reportResult(room.getId(), hostId, 10, 7);

        assertThat(result.winnerUserId()).isEqualTo(hostId);
        assertThat(userRepository.findById(hostId).orElseThrow().getWinCount()).isEqualTo(1);
        assertThat(userRepository.findById(guestId).orElseThrow().getLossCount()).isEqualTo(1);
        assertThat(gameRoomRepository.findById(room.getId()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
    }

    @Test
    void reportResult_tie_returnsNullWinnerAndDoesNotChangeRecords() {
        GameRoom room = createReadyRoom();
        gameRoomService.start(room.getId(), hostId);

        GameResultResponse result = gameRoomService.reportResult(room.getId(), hostId, 5, 5);

        assertThat(result.winnerUserId()).isNull();
        assertThat(userRepository.findById(hostId).orElseThrow().getWinCount()).isZero();
        assertThat(userRepository.findById(guestId).orElseThrow().getLossCount()).isZero();
    }

    @Test
    void reportResult_duplicateReport_rejected() {
        GameRoom room = createReadyRoom();
        gameRoomService.start(room.getId(), hostId);
        gameRoomService.reportResult(room.getId(), hostId, 10, 7);

        assertThatThrownBy(() -> gameRoomService.reportResult(room.getId(), hostId, 3, 3))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void reportResult_onVoidedRoom_rejected() {
        GameRoom room = createReadyRoom();
        gameRoomService.start(room.getId(), hostId);
        gameRoomService.leave(room.getId(), guestId);

        assertThatThrownBy(() -> gameRoomService.reportResult(room.getId(), hostId, 10, 7))
                .isInstanceOf(BusinessException.class);
    }
}
