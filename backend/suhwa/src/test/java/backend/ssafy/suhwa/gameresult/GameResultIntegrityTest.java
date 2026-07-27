package backend.ssafy.suhwa.gameresult;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.common.config.JpaAuditingConfig;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.realtime.LobbyBroadcastService;
import backend.ssafy.suhwa.game.realtime.RoomParticipantRegistry;
import backend.ssafy.suhwa.game.realtime.RoomRealtimeNotifier;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.service.GameRoomService;
import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
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

/**
 * 대전 결과(game_results) 기록 정합성 검증(spec 004 FR-015, GAME-02-16).
 *
 * <p>스키마 변경 반영: 구 game_sessions·users.win_count는 RANK-01-02 마이그레이션으로 삭제됨.
 * 현행 game_results는 insert-only 로그이며 room_id가 없어 재대결마다 행이 누적되는 것이 정상이다.
 * 따라서 "중복 행 방지" 유니크 제약을 두지 않는다(T023 결정) — 대신 (1) 한 매치는 승자 1행/패자
 * 1행만 남기고, (2) 재대결은 정상적으로 새 행을 append함을 검증한다.
 */
@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Import(JpaAuditingConfig.class)
class GameResultIntegrityTest {

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
                gameRoomRepository, gameResultRepository,
                Mockito.mock(RoomRealtimeNotifier.class), Mockito.mock(LobbyBroadcastService.class),
                new RoomParticipantRegistry(), new RealtimeTicketService(60L),
                Mockito.mock(TaskScheduler.class), 15L,
                Mockito.mock(GameRoomService.class));
        hostId = userRepository.save(User.builder()
                .email("gi-host-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("host").build())
                .getId();
        guestId = userRepository.save(User.builder()
                .email("gi-guest-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("guest").build())
                .getId();
    }

    private Long startedRoom() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);
        gameRoomService.setReady(room.id(), hostId, true);
        gameRoomService.setReady(room.id(), guestId, true);
        gameRoomService.start(room.id(), hostId);
        return room.id();
    }

    @Test
    void singleDuelReport_leavesExactlyOneWinAndOneLossForDistinctParticipants() {
        Long roomId = startedRoom();

        gameRoomService.reportResult(roomId, hostId, hostId);

        List<GameResult> results = gameResultRepository.findAll();
        assertThat(results).hasSize(2);
        assertThat(results).filteredOn(r -> r.getScore() == 1)
                .singleElement()
                .satisfies(r -> assertThat(r.getUserId()).isEqualTo(hostId));
        assertThat(results).filteredOn(r -> r.getScore() == 0)
                .singleElement()
                .satisfies(r -> assertThat(r.getUserId()).isEqualTo(guestId));
        // 승자/패자는 서로 다른 참가자여야 한다.
        assertThat(results).extracting(GameResult::getUserId).containsExactlyInAnyOrder(hostId, guestId);
    }

    @Test
    void rematchInSameRoom_appendsNewResults_notDeduplicated() {
        Long roomId = startedRoom();
        gameRoomService.reportResult(roomId, hostId, hostId);

        // 결과 보고 후 방은 WAITING으로 복귀 — 재대결을 진행한다.
        gameRoomService.setReady(roomId, hostId, true);
        gameRoomService.setReady(roomId, guestId, true);
        gameRoomService.start(roomId, hostId);
        gameRoomService.reportResult(roomId, guestId, guestId);

        // 같은 방·같은 게임이라도 재대결은 중복이 아니라 별개 기록이므로 총 4행이 누적된다.
        List<GameResult> results = gameResultRepository.findAll();
        assertThat(results).hasSize(4);
        assertThat(results).filteredOn(r -> r.getGameType() == GameResultType.SIGN_DUEL).hasSize(4);
        // 각 사용자는 1승 1패(각 2행)를 갖는다.
        assertThat(results).filteredOn(r -> r.getUserId().equals(hostId)).hasSize(2);
        assertThat(results).filteredOn(r -> r.getUserId().equals(guestId)).hasSize(2);
    }
}
