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

    private void closeQuietly(WebSocketSession session) {
        try {
            session.close(CloseStatus.NORMAL);
        } catch (Exception ignored) {
            // 이미 끊긴 세션으로 간주하고 무시한다.
        }
    }
}
