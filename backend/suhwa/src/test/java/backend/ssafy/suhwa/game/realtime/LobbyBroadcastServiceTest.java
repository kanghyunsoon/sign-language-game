package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.willAnswer;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
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
     * 클라이언트가 이미 떠난 구독(AsyncRequestNotUsableException)은 컨테이너가 이미 비동기
     * 컨텍스트를 끝낸 상태라, complete()/completeWithError() 둘 다 부르지 않는다(버그픽스).
     * 여기서 emitter.complete()를 또 부르면 이미 끝난 컨텍스트를 재종료하려다
     * IllegalStateException이 나고, 그 처리가 /error로 비동기 디스패치되며 보안 필터까지
     * 다시 타 로그를 오염시켰다(직접 재현해 확인함).
     */
    @Test
    void sendHeartbeat_clientAlreadyGone_doesNotTouchEmitterAgain() throws Exception {
        GameRoomRepository repository = mock(GameRoomRepository.class);
        LobbySubscriberRegistry registry = new LobbySubscriberRegistry();
        SseEmitter emitter = mock(SseEmitter.class);
        willThrow(new AsyncRequestNotUsableException("client gone"))
                .given(emitter).send(any(SseEmitter.SseEventBuilder.class));
        registry.register("session-1", emitter);
        LobbyBroadcastService service = new LobbyBroadcastService(repository, registry);

        service.sendHeartbeat();

        verify(emitter, never()).complete();
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

    /**
     * 한 emitter에 대한 전송은 동시에 일어나지 않아야 한다. SseEmitter.send()는 스레드 안전하지
     * 않아, 동시에 쓰면 SSE 프레임이 섞여 클라이언트 파싱이 깨지거나 IllegalStateException으로
     * 그 구독이 끊긴다(사용자에게는 "방 목록이 갱신되지 않는" 증상).
     *
     * <p>전송 중 겹침을 직접 관측한다 — send() 진입 시 in-flight를 올리고 잠시 머문 뒤 내리며,
     * 관측된 최대 동시 진입 수가 1이어야 한다.
     */
    @Test
    void sendsToSameEmitter_areSerialized() throws Exception {
        GameRoomRepository repository = mock(GameRoomRepository.class);
        given(repository.findByStatus(GameRoomStatus.WAITING)).willReturn(List.of());
        LobbySubscriberRegistry registry = new LobbySubscriberRegistry();
        SseEmitter emitter = mock(SseEmitter.class);

        AtomicInteger inFlight = new AtomicInteger();
        AtomicInteger maxInFlight = new AtomicInteger();
        willAnswer(invocation -> {
            maxInFlight.accumulateAndGet(inFlight.incrementAndGet(), Math::max);
            Thread.sleep(20);
            inFlight.decrementAndGet();
            return null;
        }).given(emitter).send(any(SseEmitter.SseEventBuilder.class));

        registry.register("session-1", emitter);
        LobbyBroadcastService service = new LobbyBroadcastService(repository, registry);

        int threads = 8;
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(threads);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            for (int i = 0; i < threads; i++) {
                boolean heartbeat = i % 2 == 0;
                pool.submit(() -> {
                    try {
                        start.await();
                        if (heartbeat) {
                            service.sendHeartbeat();
                        } else {
                            service.broadcastUpdate();
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    } finally {
                        done.countDown();
                    }
                });
            }
            start.countDown();
            assertThat(done.await(10, TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdownNow();
        }

        assertThat(maxInFlight.get())
                .as("같은 구독에 대한 전송이 동시에 일어나면 SSE 프레임이 섞인다")
                .isEqualTo(1);
    }

    /** 스냅샷·업데이트 전송도 하트비트와 같은 종료 규칙을 따른다. */
    @Test
    void broadcastUpdate_clientAlreadyGone_doesNotTouchEmitterAgain() throws Exception {
        GameRoomRepository repository = mock(GameRoomRepository.class);
        given(repository.findByStatus(GameRoomStatus.WAITING)).willReturn(List.of());
        LobbySubscriberRegistry registry = new LobbySubscriberRegistry();
        SseEmitter emitter = mock(SseEmitter.class);
        willThrow(new AsyncRequestNotUsableException("client gone"))
                .given(emitter).send(any(SseEmitter.SseEventBuilder.class));
        registry.register("session-1", emitter);
        LobbyBroadcastService service = new LobbyBroadcastService(repository, registry);

        service.broadcastUpdate();

        verify(emitter, never()).complete();
        verify(emitter, never()).completeWithError(any());
    }
}
