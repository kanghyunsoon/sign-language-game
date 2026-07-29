package backend.ssafy.suhwa.game.realtime;

import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.realtime.dto.RoomSocketMessage;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import backend.ssafy.suhwa.game.service.GameRoomService;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ScheduledFuture;
import lombok.extern.slf4j.Slf4j;
import org.jspecify.annotations.NonNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.task.TaskRejectedException;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

/**
 * 방 내 실시간 WebSocket 핸들러(순수 TextWebSocketHandler, research.md #10).
 * 연결 성공 시 세션을 등록하고, 비정상 종료(afterConnectionClosed)면 유예 타이머를
 * 예약해 만료 시 {@link GameRoomService#leave}를 호출한다(research.md #12).
 */
@Slf4j
@Component
public class GameRoomWebSocketHandler extends TextWebSocketHandler {

    private final RoomParticipantRegistry registry;
    private final RoomRealtimeNotifier notifier;
    private final GameRoomService gameRoomService;
    private final GameRoomRepository gameRoomRepository;
    private final TaskScheduler taskScheduler;
    private final ObjectMapper objectMapper;
    private final long leaveGraceSeconds;

    public GameRoomWebSocketHandler(
            RoomParticipantRegistry registry,
            RoomRealtimeNotifier notifier,
            GameRoomService gameRoomService,
            GameRoomRepository gameRoomRepository,
            TaskScheduler taskScheduler,
            ObjectMapper objectMapper,
            @Value("${game.room.leave-grace-seconds}") long leaveGraceSeconds) {
        this.registry = registry;
        this.notifier = notifier;
        this.gameRoomService = gameRoomService;
        this.gameRoomRepository = gameRoomRepository;
        this.taskScheduler = taskScheduler;
        this.objectMapper = objectMapper;
        this.leaveGraceSeconds = leaveGraceSeconds;
    }

    @Override
    public void afterConnectionEstablished(@NonNull WebSocketSession session) {
        Long roomId = roomId(session);
        Long userId = userId(session);

        RoomLiveState room = registry.getOrCreateRoom(roomId);
        ParticipantLiveState participant = room.getOrCreateParticipant(userId);

        // pendingTask는 최초 확인 대기 타이머와 재접속 유예 타이머가 공유하는 필드다(research.md
        // #12). confirmed였다가(=이미 한 번 연결에 성공한 뒤) 지금 pendingTask가 있다는 것만
        // "재접속"을 의미한다 — 최초 연결도 join()이 걸어둔 확인 대기 타이머 때문에 pendingTask가
        // 항상 있으므로, pendingTask 존재 여부만으로 판단하면 최초 연결까지 재접속으로 오인한다.
        boolean reconnect = participant.isConfirmed() && participant.getPendingTask() != null;
        // 아직 한 번도 확정된 적 없는 참가자의 연결만 "최초 입장"이다(spec 004 FR-016). 이미
        // 확정된 세션이 살아있는 상태에서 들어오는 추가 연결(멀티탭)은 재접속도 입장도 아니므로
        // 어느 쪽 신호도 보내지 않는다.
        boolean firstConfirmation = !participant.isConfirmed();
        participant.cancelPending();
        participant.setConfirmed(true);

        WebSocketSession previous = participant.getSession();
        if (previous != null && previous.isOpen() && !previous.getId().equals(session.getId())) {
            closeQuietly(previous);
        }
        participant.setSession(session);

        if (reconnect) {
            notifier.notifyPeerReconnected(roomId, userId);
        } else if (firstConfirmation) {
            notifier.notifyPeerJoined(roomId, userId);
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

        // 영상 통화 전환 신호(WEBRTC_CONNECTED)를 받은 직후의 종료는 의도된 정리다 — 유예 타이머를
        // 걸지 않고 참가자를 그대로 정상 상태로 유지하며, PEER_DISCONNECTED도 보내지 않는다(FR-004).
        if (participant.isExpectingIntentionalClose()) {
            return;
        }

        Instant deadline = Instant.now().plusSeconds(leaveGraceSeconds);
        ScheduledFuture<?> task;
        try {
            task = taskScheduler.schedule(() -> gameRoomService.leave(roomId, userId), deadline);
        } catch (TaskRejectedException e) {
            // 애플리케이션 종료 중에는 스케줄러가 이미 멈춰 있다. 서블릿 컨테이너가 종료하면서
            // 열려 있던 세션을 닫기 때문에 이 경로가 반드시 호출되는데, 프로세스가 내려가는 중이라
            // 유예 타이머를 걸 의미가 없고 알림을 받을 상대 연결도 곧 끊긴다. 예약 거부를 그대로
            // 전파하면 정상적인 종료 절차가 매번 스택 트레이스로 기록된다.
            log.debug("유예 타이머 예약이 거부되어 이탈 처리를 건너뜀 roomId={}, userId={}", roomId, userId);
            return;
        }
        participant.schedulePending(deadline, task);

        notifier.notifyPeerDisconnected(roomId, userId);
    }

    @Override
    protected void handleTextMessage(@NonNull WebSocketSession session, @NonNull TextMessage message) {
        Long roomId = roomId(session);
        Long userId = userId(session);

        // 핸드셰이크 이후 나가기/방 종료로 더 이상 참가자가 아니게 된 세션이 메시지를 보내는
        // 경우를 매 메시지마다 재검증한다(FR-024, US13/T056). 핸드셰이크 시점 검증만으로는
        // 연결이 유지되는 동안의 상태 변화를 막지 못한다.
        if (!isStillParticipant(roomId, userId)) {
            sendError(session, ErrorCode.NOT_ROOM_PARTICIPANT);
            return;
        }

        RoomSocketMessage parsed;
        try {
            parsed = objectMapper.readValue(message.getPayload(), RoomSocketMessage.class);
        } catch (Exception e) {
            // 파싱할 수 없는 메시지는 조용히 무시한다 — 계약(realtime-websocket-messages.md)에
            // 없는 형식에 대한 오류 응답은 별도로 정의돼 있지 않다.
            return;
        }

        // 영상 통화 연결 신호(offer/answer/ICE candidate)는 서버가 내용을 파싱하지 않고 같은 방
        // 상대방에게 그대로 중계한다(FR-025/026, research.md #13).
        if ("SIGNAL".equals(parsed.type())) {
            notifier.relaySignal(roomId, userId, parsed.payload());
            return;
        }

        // 영상 통화가 실제로 맺어져 더 이상 필요 없어진 방 실시간 연결을 클라이언트가 의도적으로
        // 끊겠다는 신호(FR-003). afterConnectionClosed가 이 플래그를 보고 유예 타이머를 생략한다.
        if ("WEBRTC_CONNECTED".equals(parsed.type())) {
            RoomLiveState room = registry.getRoom(roomId);
            ParticipantLiveState participant = room == null ? null : room.getParticipant(userId);
            if (participant != null) {
                participant.setExpectingIntentionalClose(true);
            }
            return;
        }

        // TODO: WebSocket 메시지 송수신 로직 구현 위치 (다른 담당자 작업 예정)
        // 이 핸들러의 메시지 타입 분기(게임 진행 관련 type)에 추가될 예정.
    }

    private boolean isStillParticipant(Long roomId, Long userId) {
        return gameRoomRepository.findById(roomId)
                .map(room -> room.isParticipant(userId) && room.getStatus() != GameRoomStatus.CLOSED)
                .orElse(false);
    }

    private void sendError(WebSocketSession session, ErrorCode errorCode) {
        try {
            String json = objectMapper.writeValueAsString(new RoomSocketMessage(
                    "ERROR", Map.of("code", errorCode.name(), "message", errorCode.getDefaultMessage())));
            session.sendMessage(new TextMessage(json));
        } catch (Exception ignored) {
            // 전송 실패는 연결이 이미 끊긴 것으로 간주한다.
        }
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
