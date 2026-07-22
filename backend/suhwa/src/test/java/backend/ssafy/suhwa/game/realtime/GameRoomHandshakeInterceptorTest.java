package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.service.GameRoomService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.jspecify.annotations.NonNull;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * US13/T058 — 참가자가 아닌 사용자의 핸드셰이크 거부, 참가자였다가 방이 종료된 이후
 * 메시지 전송 시 차단되는지 검증(FR-024).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class GameRoomHandshakeInterceptorTest {

    @LocalServerPort
    private int port;

    @Autowired
    private GameRoomService gameRoomService;

    @Autowired
    private RealtimeTicketService realtimeTicketService;

    @Autowired
    private UserRepository userRepository;

    private Long hostId;
    private Long guestId;
    private Long strangerId;

    @BeforeEach
    void setUp() {
        hostId = createUser("hshost");
        guestId = createUser("hsguest");
        strangerId = createUser("hsstranger");
    }

    private Long createUser(String prefix) {
        return userRepository.save(User.builder()
                        .email(prefix + "-" + System.nanoTime() + "@test.com").passwordHash("h").nickname(prefix)
                        .build())
                .getId();
    }

    private WebSocketSession connect(Long roomId, Long userId, BlockingQueue<String> messages) throws Exception {
        String ticket = realtimeTicketService.issue(userId);
        StandardWebSocketClient client = new StandardWebSocketClient();
        return client.execute(new TextWebSocketHandler() {
                    @Override
                    protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message) {
                        messages.offer(message.getPayload());
                    }
                }, "ws://localhost:" + port + "/ws/game-rooms/" + roomId + "?ticket=" + ticket)
                .get(5, TimeUnit.SECONDS);
    }

    @Test
    void handshake_rejectsNonParticipant() {
        GameRoomResponse room = gameRoomService.create(hostId);

        assertThatThrownBy(() -> connect(room.id(), strangerId, new LinkedBlockingQueue<>()))
                .isInstanceOf(Exception.class);
    }

    @Test
    void message_afterRoomClosedByResultReport_blockedWithError() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId);
        gameRoomService.join(room.roomCode(), guestId);
        gameRoomService.setReady(room.id(), hostId, true);
        gameRoomService.setReady(room.id(), guestId, true);
        gameRoomService.start(room.id(), hostId);

        BlockingQueue<String> hostMessages = new LinkedBlockingQueue<>();
        WebSocketSession hostSession = connect(room.id(), hostId, hostMessages);

        // reportResult()는 방을 CLOSED로 바꾸지만(FR-028) WebSocket 세션은 별도로 닫지 않으므로,
        // 결과 보고 이후에도 이미 연결된 세션이 메시지를 보낼 수 있는 상태가 그대로 남는다.
        gameRoomService.reportResult(room.id(), hostId, 10, 7);

        hostSession.sendMessage(new TextMessage("{\"type\":\"PING\"}"));

        String received = hostMessages.poll(3, TimeUnit.SECONDS);
        assertThat(received).contains("ERROR").contains("NOT_ROOM_PARTICIPANT");
    }
}
