package backend.ssafy.suhwa.game.realtime;

import backend.ssafy.suhwa.game.realtime.dto.RoomSocketMessage;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

@Component
public class WebSocketRoomRealtimeNotifier implements RoomRealtimeNotifier {

    private final RoomParticipantRegistry registry;
    private final ObjectMapper objectMapper;

    public WebSocketRoomRealtimeNotifier(RoomParticipantRegistry registry, ObjectMapper objectMapper) {
        this.registry = registry;
        this.objectMapper = objectMapper;
    }

    @Override
    public void notifyPeerJoined(Long roomId, Long userId) {
        sendToOthers(roomId, userId, "PEER_JOINED", Map.of("userId", userId));
    }

    @Override
    public void notifyPeerDisconnected(Long roomId, Long userId) {
        sendToOthers(roomId, userId, "PEER_DISCONNECTED", Map.of("userId", userId));
    }

    @Override
    public void notifyPeerReconnected(Long roomId, Long userId) {
        sendToOthers(roomId, userId, "PEER_RECONNECTED", Map.of("userId", userId));
    }

    @Override
    public void notifyPeerLeft(Long roomId, Long leftUserId, Long newHostUserId) {
        RoomLiveState room = registry.getRoom(roomId);
        if (room == null) {
            return;
        }

        ParticipantLiveState left = room.getParticipant(leftUserId);
        if (left != null) {
            left.cancelPending();
            WebSocketSession session = left.getSession();
            // 레지스트리에서 먼저 제거해야, 아래 close()로 인해 뒤이어 실행될
            // GameRoomWebSocketHandler.afterConnectionClosed가 이 참가자를 찾지 못해
            // 정상적으로 무시한다(그렇지 않으면 이미 나간 참가자에 대해 PEER_DISCONNECTED가
            // 잘못 발송되고 불필요한 유예 타이머가 걸린다).
            room.removeParticipant(leftUserId);
            if (session != null && session.isOpen()) {
                closeQuietly(session);
            }
        }

        Map<String, Object> payload = new HashMap<>();
        payload.put("userId", leftUserId);
        payload.put("newHostUserId", newHostUserId);
        sendToAll(room, "PEER_LEFT", payload);

        registry.removeRoomIfEmpty(roomId);
    }

    @Override
    public void notifyGameStarted(Long roomId) {
        RoomLiveState room = registry.getRoom(roomId);
        if (room == null) {
            return;
        }
        sendToAll(room, "GAME_STARTED", Map.of("roomId", roomId));
    }

    @Override
    public void relaySignal(Long roomId, Long fromUserId, Object payload) {
        sendToOthers(roomId, fromUserId, "SIGNAL", payload);
    }

    @Override
    public void notifyReadyChanged(Long roomId, Long userId, boolean isReady) {
        sendToOthers(roomId, userId, "PEER_READY_CHANGED", Map.of("userId", userId, "isReady", isReady));
    }

    private void sendToOthers(Long roomId, Long excludeUserId, String type, Object payload) {
        RoomLiveState room = registry.getRoom(roomId);
        if (room == null) {
            return;
        }
        for (Long userId : room.participantIds()) {
            if (!userId.equals(excludeUserId)) {
                send(room.getParticipant(userId), type, payload);
            }
        }
    }

    private void sendToAll(RoomLiveState room, String type, Object payload) {
        for (Long userId : room.participantIds()) {
            send(room.getParticipant(userId), type, payload);
        }
    }

    private void send(ParticipantLiveState participant, String type, Object payload) {
        if (participant == null) {
            return;
        }
        WebSocketSession session = participant.getSession();
        if (session == null || !session.isOpen()) {
            return;
        }
        try {
            String json = objectMapper.writeValueAsString(new RoomSocketMessage(type, payload));
            session.sendMessage(new TextMessage(json));
        } catch (Exception e) {
            // 전송 실패는 연결이 이미 끊긴 것으로 간주한다 — afterConnectionClosed가 별도로 정리한다.
        }
    }

    @Override
    public void disposeRoom(Long roomId) {
        // 레지스트리에서 방을 먼저 떼어낸다. 이후 실제 연결이 끊길 때 실행되는
        // GameRoomWebSocketHandler.afterConnectionClosed가 이 방을 찾지 못해 조용히 무시하므로,
        // 끝난 방에 유예 타이머가 다시 걸리거나 PEER_DISCONNECTED가 잘못 발송되지 않는다.
        RoomLiveState room = registry.removeRoom(roomId);
        if (room == null) {
            return;
        }
        // 남은 참가자의 예약 타이머를 취소한다. 방이 이미 끝났으므로 만료돼도 할 일이 없고,
        // 취소하지 않으면 스케줄러가 유예 시간만큼 leave()를 붙들고 있게 된다.
        for (Long userId : room.participantIds()) {
            ParticipantLiveState participant = room.getParticipant(userId);
            if (participant != null) {
                participant.cancelPending();
            }
        }
        // WebSocket 세션은 닫지 않는다. 끝난 방의 세션이 메시지를 보내면 ERROR(NOT_ROOM_PARTICIPANT)를
        // 받는 것이 정해진 동작이며(FR-024, US13/T056), 여기서 끊으면 클라이언트는 그 오류 대신
        // 소켓 종료를 보게 된다 — 자원 회수를 위해 계약을 바꿀 필요는 없다. 우리 쪽 참조는 위에서
        // 방 엔트리를 떼어내며 이미 사라졌으므로 누수는 해소된다.
    }

    private void closeQuietly(WebSocketSession session) {
        try {
            session.close(CloseStatus.NORMAL);
        } catch (Exception ignored) {
            // 이미 끊긴 세션으로 간주하고 무시한다.
        }
    }
}
