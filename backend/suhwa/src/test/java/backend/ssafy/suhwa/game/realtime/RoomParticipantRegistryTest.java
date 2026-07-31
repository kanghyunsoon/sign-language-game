package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ConcurrentTaskScheduler;
import org.springframework.web.socket.WebSocketSession;

class RoomParticipantRegistryTest {

    @Test
    void allOpenSessions_collectsOnlyOpenSessionsAcrossRooms() {
        RoomParticipantRegistry registry = new RoomParticipantRegistry();
        WebSocketSession openSession = mock(WebSocketSession.class);
        when(openSession.isOpen()).thenReturn(true);
        WebSocketSession closedSession = mock(WebSocketSession.class);
        when(closedSession.isOpen()).thenReturn(false);

        RoomLiveState roomA = registry.getOrCreateRoom(1L);
        roomA.getOrCreateParticipant(10L).setSession(openSession);
        roomA.getOrCreateParticipant(11L); // 세션이 아직 안 붙은 참가자(확인 대기 중)

        RoomLiveState roomB = registry.getOrCreateRoom(2L);
        roomB.getOrCreateParticipant(20L).setSession(closedSession);

        assertThat(registry.allOpenSessions()).containsExactly(openSession);
    }

    @Test
    void staleSessions_returnsOnlyOpenSessionsSeenBeforeThreshold() {
        RoomParticipantRegistry registry = new RoomParticipantRegistry();
        Instant now = Instant.now();

        WebSocketSession staleSession = mock(WebSocketSession.class);
        when(staleSession.isOpen()).thenReturn(true);
        ParticipantLiveState stale = registry.getOrCreateRoom(1L).getOrCreateParticipant(10L);
        stale.setSession(staleSession);
        stale.markSeen(now.minus(2, ChronoUnit.MINUTES));

        WebSocketSession freshSession = mock(WebSocketSession.class);
        when(freshSession.isOpen()).thenReturn(true);
        ParticipantLiveState fresh = registry.getOrCreateRoom(1L).getOrCreateParticipant(11L);
        fresh.setSession(freshSession);
        fresh.markSeen(now);

        ParticipantLiveState neverSeen = registry.getOrCreateRoom(2L).getOrCreateParticipant(20L);
        neverSeen.setSession(mock(WebSocketSession.class));

        assertThat(registry.staleSessions(now.minusSeconds(60))).containsExactly(staleSession);
    }

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
