package backend.ssafy.suhwa.game.realtime.controller;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.game.realtime.LobbyBroadcastService;
import backend.ssafy.suhwa.game.realtime.LobbySubscriberRegistry;
import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 티켓이 없거나 이미 소비/만료된 경우 401(FR-022, US13/T055)로 연결 자체를 거부한다.
 * 티켓은 1회용이라 여기서 소비하고 나면 이 연결이 살아있는 동안 다시 검증하지 않는다.
 */
@RestController
@RequiredArgsConstructor
public class LobbySseController implements LobbySseApi {

    private static final long NO_TIMEOUT = 0L;

    private final LobbySubscriberRegistry subscriberRegistry;
    private final LobbyBroadcastService broadcastService;
    private final RealtimeTicketService realtimeTicketService;

    @Override
    public SseEmitter subscribe(String ticket, HttpServletResponse response) {
        if (ticket == null || realtimeTicketService.consume(ticket).isEmpty()) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED);
        }
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
