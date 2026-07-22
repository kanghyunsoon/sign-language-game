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

    /** 확인 대기 중이거나 재접속 유예 중이어도 한 번이라도 연결에 성공한(confirmed) 참가자가 있는지(FR-030). */
    public boolean hasConfirmedParticipant() {
        return participants.values().stream().anyMatch(ParticipantLiveState::isConfirmed);
    }

    /** ConcurrentHashMap의 keySet은 약한 일관성을 가져 순회 중 수정에도 예외를 던지지 않는다. */
    public Set<Long> participantIds() {
        return participants.keySet();
    }
}
