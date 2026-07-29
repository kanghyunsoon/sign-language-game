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
            try {
                emitter.send(SseEmitter.event().name("heartbeat"));
            } catch (IOException e) {
                closeAfterFailure(emitter, e);
            }
        }
    }

    private void send(SseEmitter emitter, String eventName, Object data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
        } catch (IOException e) {
            closeAfterFailure(emitter, e);
        }
    }

    /**
     * 전송 실패한 구독을 닫는다. 어느 쪽이든 등록 시 걸어둔 콜백이 실행되므로
     * {@code LobbySubscriberRegistry}에서 제거되는 동작은 동일하다.
     *
     * <p>클라이언트가 이미 떠난 경우({@link AsyncRequestNotUsableException} — 탭 닫기, 새로고침,
     * 네트워크 단절)는 오류가 아니라 종료이므로 {@code complete()}로 조용히 닫는다.
     * {@code completeWithError()}를 쓰면 이미 끊긴 응답에 오류 본문을 쓰려고 MVC 예외 처리로
     * 다시 들어가, 정상 이탈마다 전역 핸들러가 ERROR 스택을 남기고 응답 Content-Type이
     * {@code text/event-stream}으로 확정돼 있어 2차 실패까지 발생한다.
     *
     * <p>그 외 전송 실패는 원인을 남길 가치가 있으므로 기존대로 오류로 종료한다.
     */
    private void closeAfterFailure(SseEmitter emitter, IOException e) {
        if (e instanceof AsyncRequestNotUsableException) {
            emitter.complete();
            return;
        }
        emitter.completeWithError(e);
    }
}
