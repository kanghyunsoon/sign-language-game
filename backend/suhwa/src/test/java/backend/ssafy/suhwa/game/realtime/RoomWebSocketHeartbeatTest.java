package backend.ssafy.suhwa.game.realtime;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.WebSocketSession;

class RoomWebSocketHeartbeatTest {

    @Test
    void pingAllSessions_sendsPingToEveryOpenSession() throws IOException {
        RoomParticipantRegistry registry = mock(RoomParticipantRegistry.class);
        WebSocketSession sessionA = mock(WebSocketSession.class);
        WebSocketSession sessionB = mock(WebSocketSession.class);
        given(registry.allOpenSessions()).willReturn(List.of(sessionA, sessionB));
        given(registry.staleSessions(any())).willReturn(List.of());

        new RoomWebSocketHeartbeat(registry, 60_000L).pingAllSessions();

        verify(sessionA).sendMessage(any(PingMessage.class));
        verify(sessionB).sendMessage(any(PingMessage.class));
    }

    @Test
    void pingAllSessions_oneSessionFailing_stillPingsTheRest() throws IOException {
        RoomParticipantRegistry registry = mock(RoomParticipantRegistry.class);
        WebSocketSession failing = mock(WebSocketSession.class);
        WebSocketSession healthy = mock(WebSocketSession.class);
        doThrow(new IOException("이미 끊긴 연결")).when(failing).sendMessage(any());
        given(registry.allOpenSessions()).willReturn(List.of(failing, healthy));
        given(registry.staleSessions(any())).willReturn(List.of());

        new RoomWebSocketHeartbeat(registry, 60_000L).pingAllSessions();

        verify(healthy).sendMessage(any(PingMessage.class));
    }

    @Test
    void pingAllSessions_closesOnlyStaleSessions() throws IOException {
        RoomParticipantRegistry registry = mock(RoomParticipantRegistry.class);
        WebSocketSession stale = mock(WebSocketSession.class);
        WebSocketSession fresh = mock(WebSocketSession.class);
        given(registry.allOpenSessions()).willReturn(List.of(fresh));
        given(registry.staleSessions(any())).willReturn(List.of(stale));

        new RoomWebSocketHeartbeat(registry, 60_000L).pingAllSessions();

        verify(stale).close(any(CloseStatus.class));
        verify(fresh, never()).close(any());
    }
}
