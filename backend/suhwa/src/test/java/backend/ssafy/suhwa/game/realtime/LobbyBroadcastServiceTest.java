package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.realtime.dto.LobbyRoomList;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

class LobbyBroadcastServiceTest {

    @Test
    void snapshot_returnsWaitingRoomsAsSummaries() {
        GameRoomRepository repository = mock(GameRoomRepository.class);
        LobbySubscriberRegistry registry = new LobbySubscriberRegistry();
        LobbyBroadcastService service = new LobbyBroadcastService(repository, registry);

        GameRoom room = GameRoom.builder().roomCode("ABC123").hostUserId(1L).gameType(GameType.TETRIS_DUEL).build();
        given(repository.findByStatus(GameRoomStatus.WAITING)).willReturn(List.of(room));

        LobbyRoomList snapshot = service.snapshot();

        assertThat(snapshot.rooms()).hasSize(1);
        assertThat(snapshot.rooms().get(0).roomCode()).isEqualTo("ABC123");
        // 서로 다른 게임 종류의 방이 로비 목록에서 각자의 gameType과 함께 구분되어 노출된다(FR-018).
        assertThat(snapshot.rooms().get(0).gameType()).isEqualTo(GameType.TETRIS_DUEL);
        assertThat(snapshot.rooms().get(0).capacity()).isEqualTo(2);
    }

    @Test
    void broadcastUpdate_sendsToAllRegisteredEmitters() throws Exception {
        GameRoomRepository repository = mock(GameRoomRepository.class);
        given(repository.findByStatus(GameRoomStatus.WAITING)).willReturn(List.of());
        LobbySubscriberRegistry registry = new LobbySubscriberRegistry();
        SseEmitter emitter = mock(SseEmitter.class);
        registry.register("session-1", emitter);
        LobbyBroadcastService service = new LobbyBroadcastService(repository, registry);

        service.broadcastUpdate();

        verify(emitter).send(any(SseEmitter.SseEventBuilder.class));
    }

    /**
     * 클라이언트가 이미 떠난 구독은 오류가 아니라 정상 종료로 닫는다. completeWithError로 닫으면
     * 이미 끊긴 응답에 오류 본문을 쓰려고 MVC 예외 처리로 다시 들어가, 정상 이탈마다 전역 핸들러가
     * ERROR 스택을 남긴다.
     */
    @Test
    void sendHeartbeat_clientAlreadyGone_completesWithoutError() throws Exception {
        GameRoomRepository repository = mock(GameRoomRepository.class);
        LobbySubscriberRegistry registry = new LobbySubscriberRegistry();
        SseEmitter emitter = mock(SseEmitter.class);
        willThrow(new AsyncRequestNotUsableException("client gone"))
                .given(emitter).send(any(SseEmitter.SseEventBuilder.class));
        registry.register("session-1", emitter);
        LobbyBroadcastService service = new LobbyBroadcastService(repository, registry);

        service.sendHeartbeat();

        verify(emitter).complete();
        verify(emitter, never()).completeWithError(any());
    }

    /** 클라이언트 이탈이 아닌 전송 실패는 원인을 남길 가치가 있으므로 오류로 종료한다. */
    @Test
    void sendHeartbeat_otherTransportFailure_completesWithError() throws Exception {
        GameRoomRepository repository = mock(GameRoomRepository.class);
        LobbySubscriberRegistry registry = new LobbySubscriberRegistry();
        SseEmitter emitter = mock(SseEmitter.class);
        IOException failure = new IOException("전송 실패");
        willThrow(failure).given(emitter).send(any(SseEmitter.SseEventBuilder.class));
        registry.register("session-1", emitter);
        LobbyBroadcastService service = new LobbyBroadcastService(repository, registry);

        service.sendHeartbeat();

        verify(emitter).completeWithError(failure);
        verify(emitter, never()).complete();
    }

    /** 스냅샷·업데이트 전송도 하트비트와 같은 종료 규칙을 따른다. */
    @Test
    void broadcastUpdate_clientAlreadyGone_completesWithoutError() throws Exception {
        GameRoomRepository repository = mock(GameRoomRepository.class);
        given(repository.findByStatus(GameRoomStatus.WAITING)).willReturn(List.of());
        LobbySubscriberRegistry registry = new LobbySubscriberRegistry();
        SseEmitter emitter = mock(SseEmitter.class);
        willThrow(new AsyncRequestNotUsableException("client gone"))
                .given(emitter).send(any(SseEmitter.SseEventBuilder.class));
        registry.register("session-1", emitter);
        LobbyBroadcastService service = new LobbyBroadcastService(repository, registry);

        service.broadcastUpdate();

        verify(emitter).complete();
        verify(emitter, never()).completeWithError(any());
    }
}
