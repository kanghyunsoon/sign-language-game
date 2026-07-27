package backend.ssafy.suhwa.game.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.common.config.JpaAuditingConfig;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.dto.GameResultResponse;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.realtime.LobbyBroadcastService;
import backend.ssafy.suhwa.game.realtime.RoomParticipantRegistry;
import backend.ssafy.suhwa.game.realtime.RoomRealtimeNotifier;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Import(JpaAuditingConfig.class)
class GameRoomServiceTest {

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Autowired
    private GameResultRepository gameResultRepository;

    @Autowired
    private UserRepository userRepository;

    private GameRoomService gameRoomService;
    private Long hostId;
    private Long guestId;

    @BeforeEach
    void setUp() {
        gameRoomService = new GameRoomService(
                gameRoomRepository, new GameResultService(gameResultRepository),
                Mockito.mock(RoomRealtimeNotifier.class), Mockito.mock(LobbyBroadcastService.class),
                new RoomParticipantRegistry(), new RealtimeTicketService(60L),
                Mockito.mock(TaskScheduler.class), 15L,
                Mockito.mock(GameRoomService.class));
        hostId = userRepository.save(User.builder()
                .email("host-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("host").build())
                .getId();
        guestId = userRepository.save(User.builder()
                .email("guest-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("guest").build())
                .getId();
    }

    private GameRoomResponse createReadyRoom() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);
        gameRoomService.setReady(room.id(), hostId, true);
        gameRoomService.setReady(room.id(), guestId, true);
        return room;
    }

    @Test
    void create_includesGameTypeAndRealtimeTicket() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.TETRIS_DUEL);

        assertThat(room.gameType()).isEqualTo(GameType.TETRIS_DUEL);
        assertThat(room.realtimeTicket()).isNotBlank();
        // 대전 모드 정원은 게임 종류와 무관하게 항상 2명이다(FR-020).
        assertThat(room.capacity()).isEqualTo(2);
    }

    @Test
    void join_includesRealtimeTicket_andReentryIssuesNewOne() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);

        GameRoomResponse joined = gameRoomService.join(room.roomCode(), guestId);
        assertThat(joined.realtimeTicket()).isNotBlank();

        GameRoomResponse rejoined = gameRoomService.join(room.roomCode(), guestId);
        assertThat(rejoined.realtimeTicket()).isNotBlank();
        assertThat(rejoined.realtimeTicket()).isNotEqualTo(joined.realtimeTicket());
    }

    @Test
    void join_reentryByExistingGuest_doesNotIncreaseParticipantCountOrReject() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        GameRoomResponse rejoined = gameRoomService.join(room.roomCode(), guestId);

        assertThat(rejoined.guestUserId()).isEqualTo(guestId);
        assertThat(rejoined.participantCount()).isEqualTo(2);
    }

    @Test
    void join_reentryByHost_doesNotAssignHostAsGuest() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);

        GameRoomResponse rejoined = gameRoomService.join(room.roomCode(), hostId);

        assertThat(rejoined.guestUserId()).isNull();
        assertThat(rejoined.participantCount()).isEqualTo(1);
    }

    @Test
    void waitingLeave_hostLeavesWithGuestPresent_delegatesHost() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        gameRoomService.leave(room.id(), hostId);

        GameRoom updated = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(updated.getHostUserId()).isEqualTo(guestId);
        assertThat(updated.getGuestUserId()).isNull();
        assertThat(updated.getStatus()).isEqualTo(GameRoomStatus.WAITING);
    }

    @Test
    void waitingLeave_lastParticipantLeaves_closesRoom() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);

        gameRoomService.leave(room.id(), hostId);

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
    }

    @Test
    void leave_calledAgainAfterRoomAlreadyClosed_isNoop() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        gameRoomService.leave(room.id(), hostId);
        GameRoom afterFirstLeave = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(afterFirstLeave.getHostUserId()).isEqualTo(guestId);
        assertThat(afterFirstLeave.getGuestUserId()).isNull();

        // 이미 CLOSED가 아니라 위임으로 WAITING 그대로인 상태이므로 한 번 더 닫아 CLOSED로 만든다.
        gameRoomService.leave(room.id(), guestId);
        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);

        // CLOSED된 방에 같은 사용자가 leave()를 또 호출해도 host/guest가 더 이상 바뀌면 안 된다.
        gameRoomService.leave(room.id(), guestId);
        GameRoom afterRedundantLeave = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(afterRedundantLeave.getStatus()).isEqualTo(GameRoomStatus.CLOSED);
        assertThat(afterRedundantLeave.getHostUserId()).isEqualTo(guestId);
        assertThat(afterRedundantLeave.getGuestUserId()).isNull();
    }

    @Test
    void waitingLeave_guestLeaves_freesSlotWithoutClosingRoom() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        gameRoomService.leave(room.id(), guestId);

        GameRoom updated = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(updated.getGuestUserId()).isNull();
        assertThat(updated.getStatus()).isEqualTo(GameRoomStatus.WAITING);
    }

    @Test
    void inProgressLeave_voidsMatch_noResultRecorded() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);

        gameRoomService.leave(room.id(), guestId);

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
        assertThat(gameResultRepository.count()).isZero();
    }

    @Test
    void setReady_succeedsWhileWaiting() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);

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
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.leave(room.id(), hostId);

        assertThatThrownBy(() -> gameRoomService.setReady(room.id(), hostId, true))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void start_rejectsWhenNotAllReady() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
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
    void reportResult_recordsWinnerAndLoserGameResults() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);

        GameResultResponse result = gameRoomService.reportResult(room.id(), hostId, hostId);

        assertThat(result.winnerUserId()).isEqualTo(hostId);
        List<GameResult> results = gameResultRepository.findAll();
        assertThat(results).hasSize(2);
        assertThat(results).anySatisfy(r -> {
            assertThat(r.getUserId()).isEqualTo(hostId);
            assertThat(r.getScore()).isEqualTo(1);
            assertThat(r.getGameType()).isEqualTo(GameResultType.SIGN_DUEL);
        });
        assertThat(results).anySatisfy(r -> {
            assertThat(r.getUserId()).isEqualTo(guestId);
            assertThat(r.getScore()).isEqualTo(0);
        });
    }

    @Test
    void reportResult_returnsRoomToWaiting_resetsReady_keepsParticipants() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);

        gameRoomService.reportResult(room.id(), hostId, hostId);

        GameRoom updated = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(GameRoomStatus.WAITING);
        assertThat(updated.isHostReady()).isFalse();
        assertThat(updated.isGuestReady()).isFalse();
        assertThat(updated.getHostUserId()).isEqualTo(hostId);
        assertThat(updated.getGuestUserId()).isEqualTo(guestId);
    }

    @Test
    void reportResult_thenReentry_issuesNewRealtimeTicket() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);
        gameRoomService.reportResult(room.id(), hostId, hostId);

        GameRoomResponse rejoined = gameRoomService.join(room.roomCode(), guestId);

        assertThat(rejoined.status()).isEqualTo(GameRoomStatus.WAITING);
        assertThat(rejoined.realtimeTicket()).isNotBlank();
    }

    @Test
    void reportResult_roomReappearsInWaitingLobbyList() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);

        gameRoomService.reportResult(room.id(), hostId, hostId);

        assertThat(gameRoomRepository.findByStatus(GameRoomStatus.WAITING))
                .extracting(GameRoom::getId)
                .contains(room.id());
    }

    @Test
    void reportResult_draw_returnsNullWinnerAndRecordsNothing() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);

        GameResultResponse result = gameRoomService.reportResult(room.id(), hostId, null);

        assertThat(result.winnerUserId()).isNull();
        assertThat(gameResultRepository.count()).isZero();
    }

    @Test
    void reportResult_winnerNotParticipant_rejected() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);
        Long outsiderId = userRepository.save(User.builder()
                        .email("outsider-" + System.nanoTime() + "@test.com").passwordHash("h")
                        .nickname("outsider").build())
                .getId();

        assertThatThrownBy(() -> gameRoomService.reportResult(room.id(), hostId, outsiderId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void reportResult_byNonParticipant_rejected() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);
        Long outsiderId = userRepository.save(User.builder()
                        .email("outsider2-" + System.nanoTime() + "@test.com").passwordHash("h")
                        .nickname("outsider2").build())
                .getId();

        assertThatThrownBy(() -> gameRoomService.reportResult(room.id(), outsiderId, hostId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void reportResult_duplicateReport_rejected() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);
        gameRoomService.reportResult(room.id(), hostId, hostId);

        assertThatThrownBy(() -> gameRoomService.reportResult(room.id(), hostId, hostId))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void reportResult_onVoidedRoom_rejected() {
        GameRoomResponse room = createReadyRoom();
        gameRoomService.start(room.id(), hostId);
        gameRoomService.leave(room.id(), guestId);

        assertThatThrownBy(() -> gameRoomService.reportResult(room.id(), hostId, hostId))
                .isInstanceOf(BusinessException.class);
    }
}
