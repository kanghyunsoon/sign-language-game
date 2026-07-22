package backend.ssafy.suhwa.game.realtime;

import backend.ssafy.suhwa.game.domain.GameRoomStatus;
import backend.ssafy.suhwa.game.realtime.dto.LobbyRoomList;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
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
                emitter.completeWithError(e);
            }
        }
    }

    private void send(SseEmitter emitter, String eventName, Object data) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
        } catch (IOException e) {
            emitter.completeWithError(e);
        }
    }
}
