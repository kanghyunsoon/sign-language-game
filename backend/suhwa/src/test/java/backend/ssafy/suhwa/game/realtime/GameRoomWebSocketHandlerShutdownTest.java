package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.service.GameRoomService;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

/**
 * 애플리케이션 종료 시 서블릿 컨테이너가 열려 있던 WebSocket 세션을 닫으면
 * {@code afterConnectionClosed}가 호출되는데, 그 시점의 TaskScheduler는 이미 멈춰 있어
 * 유예 타이머 예약이 거부된다. 프로세스가 내려가는 중이라 기능 영향은 없지만, 예약 거부가
 * 그대로 전파되면 정상적인 종료 절차가 매번 스택 트레이스로 기록된다.
 *
 * <p>실제로 종료된 {@link ThreadPoolTaskScheduler}를 써서 검증한다 — 예약 거부가 어떤 예외
 * 타입으로 오는지를 문서나 추측이 아니라 실행으로 확정하기 위함이다.
 */
class GameRoomWebSocketHandlerShutdownTest {

    private static final Long ROOM_ID = 42L;
    private static final Long USER_ID = 7L;

    @Test
    void afterConnectionClosed_schedulerAlreadyShutDown_doesNotPropagateRejection() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.initialize();
        scheduler.shutdown();

        RoomParticipantRegistry registry = new RoomParticipantRegistry();
        RoomRealtimeNotifier notifier = mock(RoomRealtimeNotifier.class);
        WebSocketSession session = session();

        ParticipantLiveState participant =
                registry.getOrCreateRoom(ROOM_ID).getOrCreateParticipant(USER_ID);
        participant.setConfirmed(true);
        participant.setSession(session);

        GameRoomWebSocketHandler handler = new GameRoomWebSocketHandler(
                registry,
                notifier,
                mock(GameRoomService.class),
                mock(GameRoomRepository.class),
                scheduler,
                new ObjectMapper(),
                30L);

        assertThatCode(() -> handler.afterConnectionClosed(session, CloseStatus.NORMAL))
                .as("종료 중 예약 거부는 정상 종료 절차의 일부이므로 예외로 전파되면 안 된다")
                .doesNotThrowAnyException();

        // ScheduledFuture는 Future 오버로드와 겹쳐 Object로 단정해야 모호성이 없다.
        assertThat((Object) participant.getPendingTask())
                .as("예약이 거부됐으므로 타이머가 등록되지 않아야 한다")
                .isNull();
        verify(notifier, never()).notifyPeerDisconnected(anyLong(), anyLong());
    }

    /** 스케줄러가 살아 있는 정상 경로에서는 기존 동작(타이머 등록 + 이탈 알림)이 유지된다. */
    @Test
    void afterConnectionClosed_schedulerAlive_schedulesTimerAndNotifiesPeer() {
        ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
        scheduler.initialize();
        try {
            RoomParticipantRegistry registry = new RoomParticipantRegistry();
            RoomRealtimeNotifier notifier = mock(RoomRealtimeNotifier.class);
            WebSocketSession session = session();

            ParticipantLiveState participant =
                    registry.getOrCreateRoom(ROOM_ID).getOrCreateParticipant(USER_ID);
            participant.setConfirmed(true);
            participant.setSession(session);

            GameRoomWebSocketHandler handler = new GameRoomWebSocketHandler(
                    registry,
                    notifier,
                    mock(GameRoomService.class),
                    mock(GameRoomRepository.class),
                    scheduler,
                    new ObjectMapper(),
                    30L);

            handler.afterConnectionClosed(session, CloseStatus.NORMAL);

            assertThat((Object) participant.getPendingTask()).isNotNull();
            verify(notifier).notifyPeerDisconnected(ROOM_ID, USER_ID);
        } finally {
            scheduler.shutdown();
        }
    }

    private WebSocketSession session() {
        WebSocketSession session = mock(WebSocketSession.class);
        Map<String, Object> attributes = new HashMap<>();
        attributes.put(GameRoomHandshakeInterceptor.ATTR_ROOM_ID, ROOM_ID);
        attributes.put(GameRoomHandshakeInterceptor.ATTR_USER_ID, USER_ID);
        given(session.getAttributes()).willReturn(attributes);
        return session;
    }
}
