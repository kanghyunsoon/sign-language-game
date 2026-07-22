package backend.ssafy.suhwa.game.realtime;

import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** 방 하나(최대 참가자 2명)당 하나(data-model.md RoomLiveState 참고). */
public class RoomLiveState {

    private final Map<Long, ParticipantLiveState> participants = new ConcurrentHashMap<>();

    public ParticipantLiveState getOrCreateParticipant(Long userId) {
        return participants.computeIfAbsent(userId, id -> new ParticipantLiveState());
    }

    public ParticipantLiveState getParticipant(Long userId) {
        return participants.get(userId);
    }

    public void removeParticipant(Long userId) {
        participants.remove(userId);
    }

    public boolean isEmpty() {
        return participants.isEmpty();
    }

    /** ConcurrentHashMap의 keySet은 약한 일관성을 가져 순회 중 수정에도 예외를 던지지 않는다. */
    public Set<Long> participantIds() {
        return participants.keySet();
    }
}
