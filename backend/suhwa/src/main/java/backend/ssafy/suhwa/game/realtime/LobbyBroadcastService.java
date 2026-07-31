package backend.ssafy.suhwa.game.realtime;

import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.realtime.dto.LobbyRoomList;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 대기 중(WAITING) 게임방 목록 스냅샷을 조회하고, 로비 SSE 구독자 전체에게 전송한다
 * (FR-009~FR-014, research.md #9). 방 생성/입장/퇴장/방장위임/인원변경/상태전환 등
 * 목록에 영향을 주는 변경 지점에서 {@link #broadcastUpdate()}가 호출된다(research.md #9-1).
 */
@Service
@RequiredArgsConstructor
public class LobbyBroadcastService {

    private final GameRoomRepository gameRoomRepository;
    private final LobbySubscriberRegistry subscriberRegistry;

    public LobbyRoomList snapshot() {
        return LobbyRoomList.from(gameRoomRepository.findByStatus(GameRoomStatus.WAITING));
    }

    public void sendSnapshot(SseEmitter emitter) {
        send(emitter, "snapshot", snapshot());
    }

    public void broadcastUpdate() {
        LobbyRoomList snapshot = snapshot();
        for (SseEmitter emitter : subscriberRegistry.all()) {
            send(emitter, "update", snapshot);
        }
    }

    /** Nginx/브라우저 유휴 타임아웃을 방지하기 위한 주기적 하트비트(FR-013, research.md #9). */
    @Scheduled(fixedDelay = 15_000)
    public void sendHeartbeat() {
        for (SseEmitter emitter : subscriberRegistry.all()) {
            dispatch(emitter, SseEmitter.event().name("heartbeat"));
        }
    }

    private void send(SseEmitter emitter, String eventName, Object data) {
        dispatch(emitter, SseEmitter.event().name(eventName).data(data));
    }

    /**
     * 구독 하나에 이벤트를 전송한다. 같은 emitter에 대한 전송은 반드시 이 메서드를 거쳐야 한다.
     *
     * <p>{@code SseEmitter.send()}는 스레드 안전하지 않은데, 이 클래스에는 서로 다른 스레드에서
     * 오는 전송 주체가 셋이다 — ① {@code afterCommit} 브로드캐스트를 수행하는 여러 HTTP 요청
     * 스레드 ② 15초 주기 하트비트 스케줄러 ③ 확인 대기·유예 타이머가 만료돼
     * {@code GameRoomService.leave}를 실행하는 스케줄러 풀. 한 emitter에 동시에 쓰면 SSE 프레임
     * (event/data/빈 줄)이 섞여 클라이언트가 파싱에 실패하거나 {@code IllegalStateException}으로
     * 그 구독이 끊긴다. 사용자에게는 오류 없이 "방 목록이 갱신되지 않는" 증상으로 나타난다.
     *
     * <p>이 클래스가 로비 emitter에 대한 유일한 전송 지점이므로, emitter 자신을 모니터로 삼아
     * 구독별로 직렬화하면 충분하다. 팬아웃 자체는 여전히 호출 스레드에서 수행된다 — 요청 스레드
     * 비차단과 debounce는 별도 과제(STABLE-08-19)다.
     */
    private void dispatch(SseEmitter emitter, SseEmitter.SseEventBuilder event) {
        try {
            synchronized (emitter) {
                emitter.send(event);
            }
        } catch (IOException e) {
            closeAfterFailure(emitter, e);
        }
    }

    /**
     * 전송 실패한 구독을 닫는다. 어느 쪽이든 등록 시 걸어둔 콜백이 실행되므로
     * {@code LobbySubscriberRegistry}에서 제거되는 동작은 동일하다.
     *
     * <p>클라이언트가 이미 떠난 경우({@link AsyncRequestNotUsableException} — 탭 닫기, 새로고침,
     * 네트워크 단절)는 컨테이너가 이미 이 응답의 비동기 컨텍스트를 끝낸 상태다(버그픽스, 직접
     * 재현해 확인함) — 이 예외 자체가 "더 이상 이 응답을 건드리지 마라"는 신호다. 여기서
     * {@code emitter.complete()}를 또 부르면 이미 끝난 컨텍스트를 다시 건드리는 셈이라
     * {@code IllegalStateException}("AsyncContext after an error had occurred")이 나고, 그
     * 재종료 시도가 {@code /error}로 비동기 디스패치되면서 보안 필터 체인까지 다시 타 로그를
     * 이중으로 오염시킨다. 등록 시 걸어둔 {@code onCompletion}/{@code onError} 콜백은 컨테이너의
     * 종료 처리만으로 이미 실행되므로(또는 실행될 예정이므로), 여기서 더 할 일이 없다.
     *
     * <p>그 외 전송 실패는 원인을 남길 가치가 있으므로 기존대로 오류로 종료한다.
     */
    private void closeAfterFailure(SseEmitter emitter, IOException e) {
        if (e instanceof AsyncRequestNotUsableException) {
            return;
        }
        emitter.completeWithError(e);
    }
}
