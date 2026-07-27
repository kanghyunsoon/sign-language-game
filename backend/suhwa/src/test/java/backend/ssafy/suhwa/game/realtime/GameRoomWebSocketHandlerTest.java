package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.common.security.JwtTokenProvider;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.dto.GameRoomResponse;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
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
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = "game.room.leave-grace-seconds=1")
class GameRoomWebSocketHandlerTest {

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

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    private Long hostId;
    private Long guestId;

    @BeforeEach
    void setUp() {
        hostId = userRepository.save(User.builder()
                        .email("wshost-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("wshost")
                        .build())
                .getId();
        guestId = userRepository.save(User.builder()
                        .email("wsguest-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("wsguest")
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

    /**
     * 먼저 접속해 있던 참가자는 뒤이어 들어온 참가자의 최초 입장 신호(PEER_JOINED, spec 004
     * FR-016)를 받는다. 입장 신호 자체가 검증 대상이 아닌 테스트에서 뒤따르는 단언이 이 메시지에
     * 걸리지 않도록 먼저 비운다.
     */
    private void drainPeerJoined(BlockingQueue<String> messages) throws InterruptedException {
        assertThat(messages.poll(3, TimeUnit.SECONDS)).contains("PEER_JOINED");
    }

    @Test
    void firstConnection_notifiesPeerJoinedToAlreadyConnectedPeer() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        BlockingQueue<String> hostMessages = new LinkedBlockingQueue<>();
        connect(room.id(), hostId, hostMessages);
        connect(room.id(), guestId, new LinkedBlockingQueue<>());

        assertThat(hostMessages.poll(3, TimeUnit.SECONDS))
                .as("신규 참가자의 최초 확정 시 이미 접속 중인 상대에게 PEER_JOINED가 가야 한다")
                .contains("PEER_JOINED")
                .contains("\"userId\":" + guestId);
    }

    @Test
    void reconnect_sendsPeerReconnectedOnly_notPeerJoined() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        BlockingQueue<String> guestMessages = new LinkedBlockingQueue<>();
        WebSocketSession hostSession = connect(room.id(), hostId, new LinkedBlockingQueue<>());
        connect(room.id(), guestId, guestMessages);

        hostSession.close();
        assertThat(guestMessages.poll(3, TimeUnit.SECONDS)).contains("PEER_DISCONNECTED");

        connect(room.id(), hostId, new LinkedBlockingQueue<>());

        assertThat(guestMessages.poll(3, TimeUnit.SECONDS))
                .as("이미 확정됐던 참가자의 재연결은 PEER_RECONNECTED이며 PEER_JOINED가 아니어야 한다")
                .contains("PEER_RECONNECTED")
                .doesNotContain("PEER_JOINED");
    }

    @Test
    void firstConnection_succeedsEvenWhenPeerHasNoLiveSession() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);
        // host는 실시간 연결을 맺지 않은 상태 — 상대에게 보낼 PEER_JOINED 전송이 불가능해도
        // guest의 연결 수립 자체는 성공해야 한다(전송 실패 격리).

        WebSocketSession guestSession = connect(room.id(), guestId, new LinkedBlockingQueue<>());

        assertThat(guestSession.isOpen()).isTrue();
        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.WAITING);
        guestSession.close();
    }

    @Test
    void disconnect_reconnectWithinGrace_cancelsLeave() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        WebSocketSession hostSession = connect(room.id(), hostId, new LinkedBlockingQueue<>());
        connect(room.id(), guestId, new LinkedBlockingQueue<>());

        hostSession.close();
        Thread.sleep(300);
        connect(room.id(), hostId, new LinkedBlockingQueue<>());

        Thread.sleep(1500);

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.WAITING);
        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getHostUserId()).isEqualTo(hostId);
    }

    @Test
    void disconnect_exceedsGrace_triggersLeaveAndDelegatesHost() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        BlockingQueue<String> guestMessages = new LinkedBlockingQueue<>();
        WebSocketSession hostSession = connect(room.id(), hostId, new LinkedBlockingQueue<>());
        connect(room.id(), guestId, guestMessages);

        hostSession.close();

        assertThat(guestMessages.poll(3, TimeUnit.SECONDS)).contains("PEER_DISCONNECTED");
        assertThat(guestMessages.poll(3, TimeUnit.SECONDS)).contains("PEER_LEFT");

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getHostUserId()).isEqualTo(guestId);
        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.WAITING);
    }

    @Test
    void explicitLeave_sendsPeerLeftImmediatelyWithoutGrace() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        BlockingQueue<String> guestMessages = new LinkedBlockingQueue<>();
        connect(room.id(), hostId, new LinkedBlockingQueue<>());
        connect(room.id(), guestId, guestMessages);

        RestTemplate restTemplate = new RestTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(jwtTokenProvider.createAccessToken(hostId));
        restTemplate.exchange(
                "http://localhost:" + port + "/game-rooms/" + room.id() + "/leave",
                HttpMethod.POST,
                new HttpEntity<>(headers),
                Void.class);

        String peerLeft = guestMessages.poll(2, TimeUnit.SECONDS);
        assertThat(peerLeft).contains("PEER_LEFT");
        assertThat(guestMessages.poll(500, TimeUnit.MILLISECONDS))
                .as("명시적 나가기는 PEER_DISCONNECTED 없이 곧바로 PEER_LEFT여야 한다")
                .isNull();

        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getHostUserId()).isEqualTo(guestId);
    }

    @Test
    void setReady_notifiesPeerViaWebSocket() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        BlockingQueue<String> hostMessages = new LinkedBlockingQueue<>();
        connect(room.id(), hostId, hostMessages);
        connect(room.id(), guestId, new LinkedBlockingQueue<>());
        drainPeerJoined(hostMessages);

        RestTemplate restTemplate = new RestTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(jwtTokenProvider.createAccessToken(guestId));
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        restTemplate.exchange(
                "http://localhost:" + port + "/game-rooms/" + room.id() + "/ready",
                HttpMethod.POST,
                new HttpEntity<>("{\"isReady\":true}", headers),
                GameRoomResponse.class);

        String received = hostMessages.poll(3, TimeUnit.SECONDS);
        assertThat(received).contains("PEER_READY_CHANGED").contains("\"isReady\":true");
    }

    @Test
    void setReady_succeedsEvenWhenPeerHasNoRealtimeConnection() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);
        // host는 실시간 연결을 맺지 않은 채로 guest만 준비 상태를 변경한다 — 통보 실패가 API 자체를
        // 실패시키지 않아야 한다(FR-031).

        RestTemplate restTemplate = new RestTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(jwtTokenProvider.createAccessToken(guestId));
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        var response = restTemplate.exchange(
                "http://localhost:" + port + "/game-rooms/" + room.id() + "/ready",
                HttpMethod.POST,
                new HttpEntity<>("{\"isReady\":true}", headers),
                GameRoomResponse.class);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody().guestReady()).isTrue();
    }

    @Test
    void webrtcConnected_thenDisconnect_noGraceTimerAndParticipantStaysInRoom() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        BlockingQueue<String> guestMessages = new LinkedBlockingQueue<>();
        WebSocketSession hostSession = connect(room.id(), hostId, new LinkedBlockingQueue<>());
        connect(room.id(), guestId, guestMessages);

        hostSession.sendMessage(new TextMessage("{\"type\":\"WEBRTC_CONNECTED\"}"));
        Thread.sleep(200); // 서버가 메시지를 처리해 플래그를 설정할 시간을 준다.
        hostSession.close();

        Thread.sleep(1500); // 유예 시간(1초)을 넘겨도 이탈 처리가 없어야 한다.

        assertThat(guestMessages.poll(500, TimeUnit.MILLISECONDS))
                .as("의도된 종료는 PEER_DISCONNECTED도 PEER_LEFT도 보내지 않아야 한다")
                .isNull();
        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getHostUserId()).isEqualTo(hostId);
        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.WAITING);
    }

    @Test
    void withoutWebrtcConnectedSignal_connectionStaysOpen_noForcedClose() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        WebSocketSession hostSession = connect(room.id(), hostId, new LinkedBlockingQueue<>());

        Thread.sleep(1500); // WEBRTC_CONNECTED 없이도 서버가 연결을 강제로 끊지 않아야 한다(FR-006).

        assertThat(hostSession.isOpen()).isTrue();
        hostSession.close();
    }

    @Test
    void handshake_rejectsAlreadyClosedRoom() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.leave(room.id(), hostId);
        assertThat(gameRoomRepository.findById(room.id()).orElseThrow().getStatus())
                .isEqualTo(GameRoomStatus.CLOSED);

        assertThatThrownBy(() -> connect(room.id(), hostId, new LinkedBlockingQueue<>()))
                .isInstanceOf(Exception.class);
    }

    @Test
    void startGame_broadcastsGameStartedToBothParticipants() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);
        gameRoomService.setReady(room.id(), hostId, true);
        gameRoomService.setReady(room.id(), guestId, true);

        BlockingQueue<String> hostMessages = new LinkedBlockingQueue<>();
        BlockingQueue<String> guestMessages = new LinkedBlockingQueue<>();
        connect(room.id(), hostId, hostMessages);
        connect(room.id(), guestId, guestMessages);
        drainPeerJoined(hostMessages);

        gameRoomService.start(room.id(), hostId);

        assertThat(hostMessages.poll(3, TimeUnit.SECONDS)).contains("GAME_STARTED");
        assertThat(guestMessages.poll(3, TimeUnit.SECONDS)).contains("GAME_STARTED");
    }

    @Test
    void signalMessage_relayedToRoomPeerOnly_notToOtherRoomParticipants() throws Exception {
        GameRoomResponse room = gameRoomService.create(hostId, GameType.SIGN_DUEL);
        gameRoomService.join(room.roomCode(), guestId);

        BlockingQueue<String> hostMessages = new LinkedBlockingQueue<>();
        BlockingQueue<String> guestMessages = new LinkedBlockingQueue<>();
        WebSocketSession hostSession = connect(room.id(), hostId, hostMessages);
        connect(room.id(), guestId, guestMessages);
        drainPeerJoined(hostMessages);

        Long otherRoomUserId = userRepository.save(User.builder()
                        .email("wsother-" + System.nanoTime() + "@test.com").passwordHash("h").nickname("wsother")
                        .build())
                .getId();
        GameRoomResponse otherRoom = gameRoomService.create(otherRoomUserId, GameType.SIGN_DUEL);
        BlockingQueue<String> otherRoomMessages = new LinkedBlockingQueue<>();
        connect(otherRoom.id(), otherRoomUserId, otherRoomMessages);

        hostSession.sendMessage(new TextMessage("{\"type\":\"SIGNAL\",\"payload\":{\"sdp\":\"offer-data\"}}"));

        String received = guestMessages.poll(3, TimeUnit.SECONDS);
        assertThat(received).contains("SIGNAL").contains("offer-data");

        assertThat(hostMessages.poll(500, TimeUnit.MILLISECONDS))
                .as("보낸 사람 본인에게는 릴레이되지 않아야 한다")
                .isNull();
        assertThat(otherRoomMessages.poll(500, TimeUnit.MILLISECONDS))
                .as("다른 방 참가자에게는 전달되지 않아야 한다")
                .isNull();
    }
}
