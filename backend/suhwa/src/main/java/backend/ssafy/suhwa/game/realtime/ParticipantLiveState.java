package backend.ssafy.suhwa.game.realtime;

import java.time.Instant;
import java.util.concurrent.ScheduledFuture;
import org.springframework.web.socket.WebSocketSession;

/**
 * 방 하나(최대 참가자 2명)당 참가자별 실시간 상태(data-model.md ParticipantLiveState 참고).
 * 최초 연결 확인 대기와 재접속 유예가 같은 pendingDeadline/pendingTask 필드를 공유한다
 * (research.md #12) — 두 상태가 한 참가자에게 동시에 존재할 수 없기 때문이다.
 */
public class ParticipantLiveState {

    private boolean confirmed;
    private WebSocketSession session;
    private boolean readyCache;
    private Instant pendingDeadline;
    private ScheduledFuture<?> pendingTask;
    private boolean expectingIntentionalClose;

    /** create()/join() 직후 false로 시작해, 첫 핸드셰이크 성공 시 true로 전환된 뒤 계속 유지된다(FR-029). */
    public synchronized boolean isConfirmed() {
        return confirmed;
    }

    public synchronized void setConfirmed(boolean confirmed) {
        this.confirmed = confirmed;
    }

    public synchronized WebSocketSession getSession() {
        return session;
    }

    public synchronized void setSession(WebSocketSession session) {
        this.session = session;
    }

    public synchronized boolean isReadyCache() {
        return readyCache;
    }

    public synchronized void setReadyCache(boolean readyCache) {
        this.readyCache = readyCache;
    }

    public synchronized Instant getPendingDeadline() {
        return pendingDeadline;
    }

    public synchronized ScheduledFuture<?> getPendingTask() {
        return pendingTask;
    }

    /** 대기 타이머를 등록한다(최초 확인 대기 또는 재접속 유예, research.md #12). */
    public synchronized void schedulePending(Instant deadline, ScheduledFuture<?> task) {
        this.pendingDeadline = deadline;
        this.pendingTask = task;
    }

    /** 확정 퇴장·방 폐기 시 대기 타이머를 취소한다(핸드셰이크 경로는 {@link #attachSession}이 처리). */
    public synchronized void cancelPending() {
        cancelPendingInternal();
    }

    /** 클라이언트가 WEBRTC_CONNECTED를 보내면 true로 전환된다(FR-003). true인 채로 연결이 끊기면
     * 유예 타이머 없이 참가자를 정상 상태로 유지한다(FR-004). 초기값 false. */
    public synchronized boolean isExpectingIntentionalClose() {
        return expectingIntentionalClose;
    }

    public synchronized void setExpectingIntentionalClose(boolean expectingIntentionalClose) {
        this.expectingIntentionalClose = expectingIntentionalClose;
    }

    /**
     * 새 연결 수립에 따른 상태 전이를 한 번에 수행하고, 호출자가 보내야 할 신호와 정리해야 할
     * 이전 세션을 반환한다.
     *
     * <p>개별 getter/setter만 {@code synchronized}이면 호출부의 판정→전이 시퀀스가 원자적이지
     * 않다. 종료 처리와 새 연결이 겹칠 때 <b>방금 등록한 세션 참조가 {@code null}로 덮여</b> 그
     * 참가자가 이후 모든 실시간 알림을 받지 못하는 문제가 있었다.
     */
    public synchronized AttachResult attachSession(WebSocketSession newSession) {
        // 아직 한 번도 확정된 적 없는 참가자의 연결만 "최초 입장"이다(FR-016).
        boolean firstConfirmation = !confirmed;
        // 확정된 적이 있는데 살아있는 세션이 없다면 재접속이다. 유예 타이머가 걸린 경우(재접속
        // 유예)와 의도된 종료 후 다시 붙는 경우(재대결)를 모두 포착한다 — pendingTask 유무로
        // 판정하면 후자를 놓쳐 어떤 신호도 보내지 않게 된다. 확정된 세션이 살아있는 상태에서
        // 들어오는 추가 연결(멀티탭)은 재접속도 입장도 아니므로 둘 다 false다.
        boolean reconnect = confirmed && session == null;

        cancelPendingInternal();
        confirmed = true;
        // 새 연결은 아직 의도된 종료를 예고하지 않았다. 이 초기화가 없으면 WEBRTC_CONNECTED를
        // 한 번 보낸 참가자는 이후 어떤 비정상 이탈에서도 유예 타이머가 걸리지 않아 이탈 감지가
        // 영구히 죽는다.
        expectingIntentionalClose = false;

        WebSocketSession previous = session;
        session = newSession;
        return new AttachResult(reconnect, firstConfirmation, previous);
    }

    /**
     * 이 세션이 현재 세션일 때만 분리하고, 호출자가 이어서 할 일을 결과로 알려준다.
     * 의도된 종료 신호는 여기서 소비된다(1회용).
     */
    public synchronized DetachOutcome detachSessionIfCurrent(WebSocketSession closingSession) {
        if (session != closingSession) {
            // 이미 명시적 나가기로 제거됐거나 다른 세션으로 교체된 이후(멀티탭)라 이 종료는
            // 더 이상 의미가 없다.
            return DetachOutcome.NOT_CURRENT;
        }
        session = null;
        if (expectingIntentionalClose) {
            expectingIntentionalClose = false;
            return DetachOutcome.INTENTIONAL_CLOSE;
        }
        return DetachOutcome.GRACE_REQUIRED;
    }

    private void cancelPendingInternal() {
        if (pendingTask != null) {
            pendingTask.cancel(false);
        }
        this.pendingTask = null;
        this.pendingDeadline = null;
    }

    /**
     * {@link #attachSession} 결과.
     *
     * @param reconnect 재접속이라 {@code PEER_RECONNECTED}를 보내야 하는지
     * @param firstConfirmation 최초 입장이라 {@code PEER_JOINED}를 보내야 하는지
     * @param previousSession 교체된 이전 세션(없으면 {@code null}) — 호출자가 닫는다
     */
    public record AttachResult(boolean reconnect, boolean firstConfirmation, WebSocketSession previousSession) {}

    /** {@link #detachSessionIfCurrent} 결과. */
    public enum DetachOutcome {
        /** 현재 세션이 아니라 무시해야 한다. */
        NOT_CURRENT,
        /** 영상 통화 전환에 따른 의도된 종료(FR-004) — 유예 타이머도 이탈 알림도 없다. */
        INTENTIONAL_CLOSE,
        /** 비정상 종료 — 유예 타이머를 걸고 상대에게 알려야 한다. */
        GRACE_REQUIRED
    }
}
