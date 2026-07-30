package backend.ssafy.suhwa.game.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import backend.ssafy.suhwa.game.realtime.ParticipantLiveState.AttachResult;
import backend.ssafy.suhwa.game.realtime.ParticipantLiveState.DetachOutcome;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.WebSocketSession;

/** 연결 상태 전이 규칙과 그 원자성을 검증한다. */
class ParticipantLiveStateTest {

    @Test
    void firstAttach_isFirstConfirmation_notReconnect() {
        ParticipantLiveState participant = new ParticipantLiveState();

        AttachResult result = participant.attachSession(mock(WebSocketSession.class));

        assertThat(result.firstConfirmation()).isTrue();
        assertThat(result.reconnect()).isFalse();
        assertThat(result.previousSession()).isNull();
        assertThat(participant.isConfirmed()).isTrue();
    }

    /** 확정된 적이 있고 살아있는 세션이 없으면 재접속이다 — 유예 중이든 의도된 종료 후든 동일하다. */
    @Test
    void attachAfterSessionDetached_isReconnect() {
        ParticipantLiveState participant = new ParticipantLiveState();
        WebSocketSession first = mock(WebSocketSession.class);
        participant.attachSession(first);
        participant.detachSessionIfCurrent(first);

        AttachResult result = participant.attachSession(mock(WebSocketSession.class));

        assertThat(result.reconnect()).isTrue();
        assertThat(result.firstConfirmation()).isFalse();
    }

    /** 확정된 세션이 살아있는 상태의 추가 연결(멀티탭)은 재접속도 입장도 아니다. */
    @Test
    void attachWhileSessionAlive_isNeither_andReturnsPreviousSession() {
        ParticipantLiveState participant = new ParticipantLiveState();
        WebSocketSession first = mock(WebSocketSession.class);
        participant.attachSession(first);

        AttachResult result = participant.attachSession(mock(WebSocketSession.class));

        assertThat(result.reconnect()).isFalse();
        assertThat(result.firstConfirmation()).isFalse();
        assertThat(result.previousSession()).isSameAs(first);
    }

    /**
     * 의도된 종료 신호는 새 연결에서 반드시 초기화돼야 한다. 초기화가 없으면 WEBRTC_CONNECTED를
     * 한 번 보낸 참가자는 이후 어떤 비정상 이탈에서도 유예 타이머가 걸리지 않아 이탈 감지가
     * 영구히 죽는다(재대결로 방이 WAITING으로 복귀하면 실제로 도달하는 경로다).
     */
    @Test
    void attach_resetsIntentionalCloseExpectation() {
        ParticipantLiveState participant = new ParticipantLiveState();
        WebSocketSession first = mock(WebSocketSession.class);
        participant.attachSession(first);
        participant.setExpectingIntentionalClose(true);
        assertThat(participant.detachSessionIfCurrent(first)).isEqualTo(DetachOutcome.INTENTIONAL_CLOSE);

        WebSocketSession second = mock(WebSocketSession.class);
        participant.attachSession(second);

        assertThat(participant.isExpectingIntentionalClose()).isFalse();
        assertThat(participant.detachSessionIfCurrent(second))
                .as("재연결 이후의 비정상 종료는 다시 유예 타이머 대상이어야 한다")
                .isEqualTo(DetachOutcome.GRACE_REQUIRED);
    }

    /** 의도된 종료 신호는 1회용이다 — detach에서 소비된다. */
    @Test
    void intentionalCloseExpectation_isConsumedOnDetach() {
        ParticipantLiveState participant = new ParticipantLiveState();
        WebSocketSession session = mock(WebSocketSession.class);
        participant.attachSession(session);
        participant.setExpectingIntentionalClose(true);

        participant.detachSessionIfCurrent(session);

        assertThat(participant.isExpectingIntentionalClose()).isFalse();
    }

    @Test
    void detachWithStaleSession_isNotCurrent_andKeepsCurrentSession() {
        ParticipantLiveState participant = new ParticipantLiveState();
        WebSocketSession stale = mock(WebSocketSession.class);
        participant.attachSession(stale);
        WebSocketSession current = mock(WebSocketSession.class);
        participant.attachSession(current);

        assertThat(participant.detachSessionIfCurrent(stale)).isEqualTo(DetachOutcome.NOT_CURRENT);
        assertThat(participant.getSession()).isSameAs(current);
    }

    /**
     * 종료 처리와 새 연결이 겹쳐도 <b>방금 등록한 세션 참조가 살아남아야</b> 한다. 판정과 전이가
     * 나뉘어 있으면 detach가 새 세션을 null로 덮어, 그 참가자는 이후 모든 실시간 알림을 받지
     * 못한다(PEER_LEFT·GAME_STARTED 포함).
     */
    @Test
    void concurrentDetachAndAttach_neverLosesTheNewSession() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 500; i++) {
                ParticipantLiveState participant = new ParticipantLiveState();
                WebSocketSession old = mock(WebSocketSession.class);
                participant.attachSession(old);
                WebSocketSession fresh = mock(WebSocketSession.class);

                CountDownLatch start = new CountDownLatch(1);
                CountDownLatch done = new CountDownLatch(2);
                pool.submit(() -> {
                    awaitQuietly(start);
                    participant.detachSessionIfCurrent(old);
                    done.countDown();
                });
                pool.submit(() -> {
                    awaitQuietly(start);
                    participant.attachSession(fresh);
                    done.countDown();
                });
                start.countDown();
                assertThat(done.await(5, TimeUnit.SECONDS)).isTrue();

                assertThat(participant.getSession())
                        .as("새로 등록된 세션이 종료 처리에 덮여서는 안 된다 (반복 %d)", i)
                        .isSameAs(fresh);
            }
        } finally {
            pool.shutdownNow();
        }
    }

    private void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
