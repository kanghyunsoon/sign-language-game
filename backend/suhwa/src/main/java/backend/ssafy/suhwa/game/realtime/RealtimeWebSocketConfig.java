package backend.ssafy.suhwa.game.realtime;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * 방 실시간 WebSocket 엔드포인트 등록. Origin 허용 목록은 REST와 같은
 * {@code cors.allowed-origins}를 쓰므로, 미설정 시 동작도 동일하게 <b>전면 차단</b>이다
 * (fail-closed, FR-019 — 근거와 기동 경고는 {@code CorsConfig} 참조).
 */
@Configuration
@EnableWebSocket
public class RealtimeWebSocketConfig implements WebSocketConfigurer {

    private final GameRoomWebSocketHandler gameRoomWebSocketHandler;
    private final GameRoomHandshakeInterceptor gameRoomHandshakeInterceptor;
    private final String[] allowedOrigins;

    public RealtimeWebSocketConfig(
            GameRoomWebSocketHandler gameRoomWebSocketHandler,
            GameRoomHandshakeInterceptor gameRoomHandshakeInterceptor,
            @Value("${cors.allowed-origins:}") String allowedOrigins) {
        this.gameRoomWebSocketHandler = gameRoomWebSocketHandler;
        this.gameRoomHandshakeInterceptor = gameRoomHandshakeInterceptor;
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toArray(String[]::new);
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(gameRoomWebSocketHandler, "/ws/game-rooms/{roomId}")
                .addInterceptors(gameRoomHandshakeInterceptor)
                .setAllowedOriginPatterns(allowedOrigins);
    }
}
