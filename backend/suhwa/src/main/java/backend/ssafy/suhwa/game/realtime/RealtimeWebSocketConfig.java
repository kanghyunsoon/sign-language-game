package backend.ssafy.suhwa.game.realtime;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

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
