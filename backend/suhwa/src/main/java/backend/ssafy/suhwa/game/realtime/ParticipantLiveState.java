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

    /** 핸드셰이크 성공(최초 연결/재접속) 또는 확정 퇴장 시 대기 타이머를 취소한다. */
    public synchronized void cancelPending() {
        if (pendingTask != null) {
            pendingTask.cancel(false);
        }
        this.pendingTask = null;
        this.pendingDeadline = null;
    }

    /** 클라이언트가 WEBRTC_CONNECTED를 보내면 true로 전환된다(FR-003). true인 채로 연결이 끊기면
     * 유예 타이머 없이 참가자를 정상 상태로 유지한다(FR-004). 초기값 false. */
    public synchronized boolean isExpectingIntentionalClose() {
        return expectingIntentionalClose;
    }

    public synchronized void setExpectingIntentionalClose(boolean expectingIntentionalClose) {
        this.expectingIntentionalClose = expectingIntentionalClose;
    }
}
