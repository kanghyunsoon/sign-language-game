package backend.ssafy.suhwa.game.realtime.controller;

import backend.ssafy.suhwa.game.realtime.LobbyBroadcastService;
import backend.ssafy.suhwa.game.realtime.LobbySubscriberRegistry;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 브라우저 EventSource 자동 재연결은 응답 바디를 읽지 않으므로, 이 단계(US9)에서는 ticket 파라미터를
 * 검증하지 않고 누구나 연결할 수 있게 둔다. 티켓 기반 접근 거부는 US13(T055)에서 강화한다.
 */
@RestController
@RequiredArgsConstructor
public class LobbySseController implements LobbySseApi {

    private static final long NO_TIMEOUT = 0L;

    private final LobbySubscriberRegistry subscriberRegistry;
    private final LobbyBroadcastService broadcastService;

    @Override
    public SseEmitter subscribe(String ticket, HttpServletResponse response) {
        response.setHeader("X-Accel-Buffering", "no");

        SseEmitter emitter = new SseEmitter(NO_TIMEOUT);
        String sessionId = UUID.randomUUID().toString();

        subscriberRegistry.register(sessionId, emitter);
        emitter.onCompletion(() -> subscriberRegistry.remove(sessionId));
        emitter.onTimeout(() -> subscriberRegistry.remove(sessionId));
        emitter.onError(e -> subscriberRegistry.remove(sessionId));

        broadcastService.sendSnapshot(emitter);
        return emitter;
    }
}
