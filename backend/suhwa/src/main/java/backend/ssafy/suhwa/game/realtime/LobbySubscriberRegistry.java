package backend.ssafy.suhwa.game.realtime;

import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 로비 실시간 목록(SSE) 구독자를 관리한다(data-model.md LobbySubscription). 단일 인스턴스
 * 운영이 전제이므로 인메모리 맵으로 충분하다(아키텍처 결정 1).
 */
@Component
public class LobbySubscriberRegistry {

    private final Map<String, SseEmitter> subscribers = new ConcurrentHashMap<>();

    public void register(String sessionId, SseEmitter emitter) {
        subscribers.put(sessionId, emitter);
    }

    public void remove(String sessionId) {
        subscribers.remove(sessionId);
    }

    public Collection<SseEmitter> all() {
        return subscribers.values();
    }
}
