package backend.ssafy.suhwa.game.realtime;

import backend.ssafy.suhwa.game.service.GameRoomService;
import java.time.Instant;
import java.util.concurrent.ScheduledFuture;
import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/**
 * 방 내 실시간 WebSocket 핸들러(순수 TextWebSocketHandler, research.md #10).
 * 연결 성공 시 세션을 등록하고, 비정상 종료(afterConnectionClosed)면 유예 타이머를
 * 예약해 만료 시 {@link GameRoomService#leave}를 호출한다(research.md #12).
 */
@Component
public class GameRoomWebSocketHandler extends TextWebSocketHandler {

    private final RoomParticipantRegistry registry;
    private final RoomRealtimeNotifier notifier;
    private final GameRoomService gameRoomService;
    private final TaskScheduler taskScheduler;
    private final long leaveGraceSeconds;

    public GameRoomWebSocketHandler(
            RoomParticipantRegistry registry,
            RoomRealtimeNotifier notifier,
            GameRoomService gameRoomService,
            TaskScheduler taskScheduler,
            @Value("${game.room.leave-grace-seconds}") long leaveGraceSeconds) {
        this.registry = registry;
        this.notifier = notifier;
        this.gameRoomService = gameRoomService;
        this.taskScheduler = taskScheduler;
        this.leaveGraceSeconds = leaveGraceSeconds;
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) {
        Long roomId = roomId(session);
        Long userId = userId(session);

        RoomLiveState room = registry.getOrCreateRoom(roomId);
        ParticipantLiveState participant = room.getOrCreateParticipant(userId);

        boolean reconnect = participant.getPendingTask() != null;
        participant.cancelPending();

        WebSocketSession previous = participant.getSession();
        if (previous != null && previous.isOpen() && !previous.getId().equals(session.getId())) {
            closeQuietly(previous);
        }
        participant.setSession(session);

        if (reconnect) {
            notifier.notifyPeerReconnected(roomId, userId);
        }
    }

    @Override
    public void afterConnectionClosed(@NonNull WebSocketSession session, @NonNull CloseStatus status) {
        Long roomId = roomId(session);
        Long userId = userId(session);

        RoomLiveState room = registry.getRoom(roomId);
        if (room == null) {
            return;
        }
        ParticipantLiveState participant = room.getParticipant(userId);
        if (participant == null || participant.getSession() != session) {
            // 이미 명시적 나가기로 제거됐거나(레지스트리에서 삭제됨) 다른 세션으로 교체된 이후(멀티탭)라
            // 이 세션의 종료는 더 이상 의미가 없다.
            return;
        }

        participant.setSession(null);
        Instant deadline = Instant.now().plusSeconds(leaveGraceSeconds);
        ScheduledFuture<?> task = taskScheduler.schedule(() -> gameRoomService.leave(roomId, userId), deadline);
        participant.schedulePending(deadline, task);

        notifier.notifyPeerDisconnected(roomId, userId);
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message) {
        // TODO: WebSocket 메시지 송수신 로직 구현 위치 (다른 담당자 작업 예정)
        // 이 핸들러의 메시지 타입 분기(SIGNAL 이후, 게임 진행 관련 type)에 추가될 예정.
    }

    private Long roomId(WebSocketSession session) {
        return (Long) session.getAttributes().get(GameRoomHandshakeInterceptor.ATTR_ROOM_ID);
    }

    private Long userId(WebSocketSession session) {
        return (Long) session.getAttributes().get(GameRoomHandshakeInterceptor.ATTR_USER_ID);
    }

    private void closeQuietly(WebSocketSession session) {
        try {
            session.close(CloseStatus.NORMAL);
        } catch (Exception ignored) {
            // 이미 끊긴 세션으로 간주하고 무시한다.
        }
    }
}
