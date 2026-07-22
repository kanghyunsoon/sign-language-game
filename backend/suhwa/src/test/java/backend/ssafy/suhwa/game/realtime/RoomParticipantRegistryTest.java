package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ConcurrentTaskScheduler;

class RoomParticipantRegistryTest {

    @Test
    void getOrCreateRoom_returnsSameInstanceOnRepeatedCalls() {
        RoomParticipantRegistry registry = new RoomParticipantRegistry();

        RoomLiveState first = registry.getOrCreateRoom(1L);
        RoomLiveState second = registry.getOrCreateRoom(1L);

        assertThat(first).isSameAs(second);
    }

    @Test
    void getOrCreateParticipant_returnsSameInstanceOnRepeatedCalls() {
        RoomLiveState room = new RoomLiveState();

        ParticipantLiveState first = room.getOrCreateParticipant(10L);
        ParticipantLiveState second = room.getOrCreateParticipant(10L);

        assertThat(first).isSameAs(second);
    }

    @Test
    void removeParticipant_removesEntryAndRoomBecomesEmpty() {
        RoomLiveState room = new RoomLiveState();
        room.getOrCreateParticipant(10L);

        room.removeParticipant(10L);

        assertThat(room.getParticipant(10L)).isNull();
        assertThat(room.isEmpty()).isTrue();
    }

    @Test
    void removeRoomIfEmpty_removesOnlyWhenNoParticipantsRemain() {
        RoomParticipantRegistry registry = new RoomParticipantRegistry();
        RoomLiveState room = registry.getOrCreateRoom(1L);
        room.getOrCreateParticipant(10L);

        registry.removeRoomIfEmpty(1L);
        assertThat(registry.getRoom(1L)).isNotNull();

        room.removeParticipant(10L);
        registry.removeRoomIfEmpty(1L);
        assertThat(registry.getRoom(1L)).isNull();
    }

    @Test
    void schedulePendingAndCancelPending_clearsDeadlineAndCancelsTask() {
        ParticipantLiveState participant = new ParticipantLiveState();
        ConcurrentTaskScheduler scheduler = new ConcurrentTaskScheduler();
        Instant deadline = Instant.now().plusSeconds(10);
        var task = scheduler.schedule(() -> { }, deadline);

        participant.schedulePending(deadline, task);
        assertThat(participant.getPendingDeadline()).isEqualTo(deadline);
        assertThat((Object) participant.getPendingTask()).isSameAs(task);

        participant.cancelPending();

        assertThat(participant.getPendingDeadline()).isNull();
        assertThat((Object) participant.getPendingTask()).isNull();
        assertThat(task.isCancelled()).isTrue();
    }
}
