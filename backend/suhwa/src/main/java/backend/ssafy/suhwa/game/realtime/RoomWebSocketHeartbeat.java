package backend.ssafy.suhwa.game.realtime;

import java.io.IOException;
import java.time.Instant;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.WebSocketSession;

/**
 * 방 WebSocket 연결의 생사를 능동적으로 확인한다(버그픽스, research.md 없음).
 *
 * <p>close 프레임 없이 조용히 끊긴 연결(와이파이 단절, 절전모드 등)은
 * {@code GameRoomWebSocketHandler#afterConnectionClosed}가 절대 호출되지 않아, 그 방이
 * {@code confirmed} 상태로 영원히 남는다 — {@code GameRoomCleanupScheduler}도 confirmed
 * 참가자가 있으면 방치로 보지 않으므로 이런 방은 어떤 자동 정리에도 걸리지 않았다.
 *
 * <p>여기서 보내는 PING은 애플리케이션이 정의한 메시지가 아니라 WebSocket 표준 제어
 * 프레임이라, 브라우저가 스펙에 따라 자동으로 PONG을 응답한다 — 프론트 변경이 필요 없다.
 * PONG(또는 다른 트래픽)이 없어 {@code idleTimeout}보다 오래 조용한 세션은 이 클래스가 직접
 * 닫는다 — 그 뒤로는 기존 {@code afterConnectionClosed} → 유예 타이머 → {@code leave()} 경로를
 * 그대로 탄다. (컨테이너 레벨 idle timeout 대신 직접 닫는 이유: {@code ServletServerContainerFactoryBean}은
 * 진짜 내장 서버가 떠 있어야만 동작해 MockMvc 기반 통합 테스트의 ApplicationContext 로딩 자체를
 * 깨뜨린다 — 직접 재현해 확인함.)
 */
@Slf4j
@Component
public class RoomWebSocketHeartbeat {

    private final RoomParticipantRegistry registry;
    private final long idleTimeoutMs;

    public RoomWebSocketHeartbeat(
            RoomParticipantRegistry registry, @Value("${game.room.ws-idle-timeout-ms}") long idleTimeoutMs) {
        this.registry = registry;
        this.idleTimeoutMs = idleTimeoutMs;
    }

    @Scheduled(fixedDelayString = "${game.room.ws-ping-interval-ms}")
    public void pingAllSessions() {
        for (WebSocketSession session : registry.allOpenSessions()) {
            try {
                session.sendMessage(new PingMessage());
            } catch (IOException e) {
                // 전송 실패는 연결이 이미 끊긴 것으로 간주한다 — 아래 stale 정리가 뒤이어
                // 처리하므로 여기서 추가로 닫지 않는다.
                log.debug("PING 전송 실패, 연결이 이미 끊긴 것으로 간주", e);
            }
        }
        closeStaleSessions();
    }

    private void closeStaleSessions() {
        Instant threshold = Instant.now().minusMillis(idleTimeoutMs);
        for (WebSocketSession session : registry.staleSessions(threshold)) {
            try {
                session.close(CloseStatus.SESSION_NOT_RELIABLE);
            } catch (IOException e) {
                log.debug("stale 세션 종료 실패, 이미 끊긴 것으로 간주", e);
            }
        }
    }
}
