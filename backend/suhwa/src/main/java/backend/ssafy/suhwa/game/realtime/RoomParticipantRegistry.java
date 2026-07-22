package backend.ssafy.suhwa.game.realtime;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

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
}
