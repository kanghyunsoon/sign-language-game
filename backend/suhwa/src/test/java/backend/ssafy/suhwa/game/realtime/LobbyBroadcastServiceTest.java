package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.domain.GameType;
import backend.ssafy.suhwa.game.realtime.dto.LobbyRoomList;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
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
}
