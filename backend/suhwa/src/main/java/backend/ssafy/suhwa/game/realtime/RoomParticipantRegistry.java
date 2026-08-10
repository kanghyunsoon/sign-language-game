package backend.ssafy.suhwa.game.realtime;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

/**
 * 방 내 실시간 참가자 상태(WebSocket 세션, ready 캐시, 대기 타이머)를 관리한다
 * (data-model.md RoomLiveState/ParticipantLiveState, research.md #11). 단일 인스턴스
 * 운영이 전제이므로 인메모리 맵으로 충분하다(아키텍처 결정 1).
 */
@Component
public class RoomParticipantRegistry {

    private final Map<Long, RoomLiveState> rooms = new ConcurrentHashMap<>();

    public RoomLiveState getOrCreateRoom(Long roomId) {
        return rooms.computeIfAbsent(roomId, id -> new RoomLiveState());
    }

    public RoomLiveState getRoom(Long roomId) {
        return rooms.get(roomId);
    }

    /** 방에 남은 참가자가 없으면 레지스트리에서 방 자체를 제거한다. */
    public void removeRoomIfEmpty(Long roomId) {
        rooms.computeIfPresent(roomId, (id, state) -> state.isEmpty() ? null : state);
    }

    /**
     * 남은 참가자가 있어도 방을 레지스트리에서 떼어내고 그 상태를 반환한다(없으면 {@code null}).
     * 방 생명주기가 끝났을 때의 자원 폐기용이며, 반환된 상태에 남은 예약 타이머의 취소는 호출자가
     * 수행한다({@code RoomRealtimeNotifier.disposeRoom}). 세션은 닫지 않는다 — 근거는 같은 메서드
     * 참조.
     */
    public RoomLiveState removeRoom(Long roomId) {
        return rooms.remove(roomId);
    }

    /**
     * 지금 열려있는 모든 방 참가자의 WS 세션을 모은다({@link RoomWebSocketHeartbeat}가 PING을
     * 보낼 대상 조회용, 버그픽스). 스냅샷이라 순회 도중의 변경은 반영되지 않는다.
     */
    public List<WebSocketSession> allOpenSessions() {
        List<WebSocketSession> sessions = new ArrayList<>();
        for (RoomLiveState room : rooms.values()) {
            for (Long userId : room.participantIds()) {
                ParticipantLiveState participant = room.getParticipant(userId);
                WebSocketSession session = participant == null ? null : participant.getSession();
                if (session != null && session.isOpen()) {
                    sessions.add(session);
                }
            }
        }
        return sessions;
    }

    /**
     * {@code threshold}보다 오래 전에 마지막 생존 확인(PONG 등)이 있었던, 즉 close 프레임 없이
     * 조용히 끊겼을 가능성이 있는 열린 세션들을 모은다(버그픽스, research.md 없음). 아직 한 번도
     * 확인되지 않은 참가자(lastSeenAt == null, 확인 대기 중)는 대상에서 제외한다 — 그건 이미
     * join-confirmation 타이머가 별도로 처리한다.
     */
    public List<WebSocketSession> staleSessions(Instant threshold) {
        List<WebSocketSession> stale = new ArrayList<>();
        for (RoomLiveState room : rooms.values()) {
            for (Long userId : room.participantIds()) {
                ParticipantLiveState participant = room.getParticipant(userId);
                if (participant == null) {
                    continue;
                }
                WebSocketSession session = participant.getSession();
                Instant lastSeenAt = participant.getLastSeenAt();
                if (session != null && session.isOpen() && lastSeenAt != null && lastSeenAt.isBefore(threshold)) {
                    stale.add(session);
                }
            }
        }
        return stale;
    }
}
