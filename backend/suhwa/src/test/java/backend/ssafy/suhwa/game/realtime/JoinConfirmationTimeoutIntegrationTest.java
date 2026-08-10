package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.service.GameRoomService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.util.concurrent.TimeUnit;
import org.jspecify.annotations.NonNull;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * US15/T070·T071 — 방 생성/입장 후 확인 대기 시간(15초, 테스트는 1초로 단축) 안에 실시간
 * 연결을 확립하지 않으면 자동으로 방치가 정리되는지 검증(FR-029/030).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "game.room.join-confirmation-seconds=1")
class JoinConfirmationTimeoutIntegrationTest {

    @LocalServerPort
    private int port;

    @Autowired
    private GameRoomService gameRoomService;

    @Autowired
    private GameRoomRepository gameRoomRepository;

    @Autowired
    private RealtimeTicketService realtimeTicketService;

    @Autowired
    private UserRepository userRepository;

    private Long hostId;
    private Long guestId;

    @BeforeEach
    void setUp() {
        hostId = createUser("jchost");
        guestId = createUser("jcguest");
    }

    private Long createUser(String prefix) {
        return userRepository.save(User.builder()
                        .email(prefix + "-" + System.nanoTime() + "@test.com").passwordHash("h").nickname(prefix)
                        .build())
                .getId();
    }

    private WebSocketSession connect(Long roomId, Long userId) throws Exception {
        String ticket = realtimeTicketService.issue(userId);
        StandardWebSocketClient client = new StandardWebSocketClient();
        return client.execute(new TextWebSocketHandler() {
                }, "ws://localhost:" + port + "/ws/game-rooms/" + roomId + "?ticket=" + ticket)
                .get(5, TimeUnit.SECONDS);
    }

    @Test
    void hostNeverConnects_withoutGuest_roomClosedAfterTimeout() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);

        Thread.sleep(1500);

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);
    }

    @Test
    void guestNeverConnects_hostConnects_guestSlotFreedRoomStaysWaiting() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        connect(room.id(), hostId);
        Thread.sleep(1500);

        var updated = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(GameRoomStatus.WAITING);
        assertThat(updated.getHostUserId()).isEqualTo(hostId);
        assertThat(updated.getGuestUserId()).isNull();
    }

    @Test
    void hostNeverConnects_guestConnects_hostDelegatedToGuest() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        connect(room.id(), guestId);
        Thread.sleep(1500);

        var updated = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(GameRoomStatus.WAITING);
        assertThat(updated.getHostUserId()).isEqualTo(guestId);
        assertThat(updated.getGuestUserId()).isNull();
    }

    @Test
    void unconfirmedParticipant_isStillCountedInParticipantCount() {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);

        GameRoomResponse joined = gameRoomService.join(room.roomCode(), guestId);

        assertThat(joined.participantCount()).isEqualTo(2);
        assertThat(joined.capacity()).isEqualTo(2);
        assertThat(joined.status()).isEqualTo(GameRoomStatus.WAITING);
    }

    @Test
    void reentry_doesNotExtendConfirmationTimer() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        connect(room.id(), hostId);

        gameRoomService.join(room.roomCode(), guestId);
        Thread.sleep(500);
        gameRoomService.join(room.roomCode(), guestId);

        Thread.sleep(700);

        // 재입장이 타이머를 연장시켰다면 최초 join()으로부터 1.5초(700+500+... 재시작분)가
        // 지나야 정리되지만, 연장되지 않았다면 최초 join()의 1초 타이머가 그대로 만료돼
        // 이 시점(최초 join으로부터 1.2초)에는 이미 게스트 자리가 비어 있어야 한다.
        var updated = gameRoomRepository.findById(room.id()).orElseThrow();
        assertThat(updated.getGuestUserId())
                .as("재입장이 확인 대기 타이머를 연장시키면 안 된다")
                .isNull();
    }
}
