package backend.ssafy.suhwa.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.common.config.JpaAuditingConfig;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.dto.GameResultResponse;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.realtime.LobbyBroadcastService;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.repository.GameSessionRepository;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
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
        gameRoomService = new GameRoomService(
                gameRoomRepository, gameSessionRepository, userRepository,
                Mockito.mock(LobbyBroadcastService.class));
        hostId = userRepository.save(User.builder()
                .email("host-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("host").build())
                .getId();
        guestId = userRepository.save(User.builder()
                .email("guest-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("guest").build())
                .getId();
    }

    private GameRoomResponse createReadyRoom() {
        GameRoomResponse room = gameRoomService.create(hostId);
        gameRoomService.join(room.roomCode(), guestId);
        gameRoomService.setReady(room.id(), hostId, true);
        gameRoomService.setReady(room.id(), guestId, true);
        return room;
    }

    @Test
    void waitingLeave_hostLeavesWithGuestPresent_delegatesHost() {
        GameRoomResponse room = gameRoomService.create(hostId);
        gameRoomService.join(room.roomCode(), guestId);

        gameRoomService.leave(room.id(), hostId);

        GameRoom updated = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(updated.getHostUserId()).isEqualTo(guestId);
        assertThat(updated.getGuestUserId()).isNull();
        assertThat(updated.getStatus()).isEqualTo(GameRoomStatus.WAITING);
    }

    @Test
    void waitingLeave_lastParticipantLeaves_closesRoom() {
        GameRoomResponse room = gameRoomService.create(hostId);

        gameRoomService.leave(room.id(), hostId);

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
    }

    @Test
    void waitingLeave_guestLeaves_freesSlotWithoutClosingRoom() {
        GameRoomResponse room = gameRoomService.create(hostId);
        gameRoomService.join(room.roomCode(), guestId);

        gameRoomService.leave(room.id(), guestId);

        GameRoom updated = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(updated.getGuestUserId()).isNull();
        assertThat(updated.getStatus()).isEqualTo(GameRoomStatus.WAITING);
    }

    @Test
    void inProgressLeave_voidsMatch_noSessionCreated() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);

        gameRoomService.leave(room.id(), guestId);

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
        assertThat(gameSessionRepository.count()).isZero();
    }

    @Test
    void setReady_succeedsWhileWaiting() {
        GameRoomResponse room = gameRoomService.create(hostId);

        GameRoomResponse updated = gameRoomService.setReady(room.id(), hostId, true);

        assertThat(updated.hostReady()).isTrue();
    }

    @Test
    void setReady_rejectedWhenInProgress() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);

        assertThatThrownBy(() -> gameRoomService.setReady(room.id(), hostId, false))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void setReady_rejectedWhenClosed() {
        GameRoomResponse room = gameRoomService.create(hostId);
        gameRoomService.leave(room.id(), hostId);

        assertThatThrownBy(() -> gameRoomService.setReady(room.id(), hostId, true))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void start_rejectsWhenNotAllReady() {
        GameRoomResponse room = gameRoomService.create(hostId);
        gameRoomService.join(room.roomCode(), guestId);
        gameRoomService.setReady(room.id(), hostId, true);

        assertThatThrownBy(() -> gameRoomService.start(room.id(), hostId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void start_rejectsWhenCallerIsNotHost() {
        GameRoomResponse room = createReadyRoom();

        assertThatThrownBy(() -> gameRoomService.start(room.id(), guestId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void reportResult_computesWinnerAndUpdatesRecordsAndClosesRoom() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);

        GameResultResponse result = gameRoomService.reportResult(room.id(), hostId, 10, 7);

        assertThat(result.winnerUserId()).isEqualTo(hostId);
        assertThat(userRepository.findById(hostId).orElseThrow().getWinCount()).isEqualTo(1);
        assertThat(userRepository.findById(guestId).orElseThrow().getLossCount()).isEqualTo(1);
        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
    }

    @Test
    void reportResult_tie_returnsNullWinnerAndDoesNotChangeRecords() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);

        GameResultResponse result = gameRoomService.reportResult(room.id(), hostId, 5, 5);

        assertThat(result.winnerUserId()).isNull();
        assertThat(userRepository.findById(hostId).orElseThrow().getWinCount()).isZero();
        assertThat(userRepository.findById(guestId).orElseThrow().getLossCount()).isZero();
    }

    @Test
    void reportResult_duplicateReport_rejected() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);
        gameRoomService.reportResult(room.id(), hostId, 10, 7);

        assertThatThrownBy(() -> gameRoomService.reportResult(room.id(), hostId, 3, 3))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void reportResult_onVoidedRoom_rejected() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);
        gameRoomService.leave(room.id(), guestId);

        assertThatThrownBy(() -> gameRoomService.reportResult(room.id(), hostId, 10, 7))
                .isInstanceOf(BusinessException.class);
    }
}
