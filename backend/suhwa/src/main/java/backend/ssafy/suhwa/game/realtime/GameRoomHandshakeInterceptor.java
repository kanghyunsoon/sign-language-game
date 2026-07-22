package backend.ssafy.suhwa.game.realtime;

import backend.ssafy.suhwa.auth.service.RealtimeTicketService;
import backend.ssafy.suhwa.game.domain.GameRoom;
import backend.ssafy.suhwa.game.repository.GameRoomRepository;
import java.net.URI;
import java.util.Map;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * 티켓 검증 + 참가자 여부 확인(FR-024, contracts/realtime-websocket-messages.md).
 * US15가 REST create()/join() 시점에 {@code RoomParticipantRegistry}를 미리 채우기
 * 전까지는(research.md #14) 참가자 여부를 DB로 직접 확인한다 — US15 이후에는 이미
 * 등록된 참가자이므로 이 조회는 항상 성공하고, 검증 자체는 그대로 유효하다.
 * 참가자가 아닌 사용자의 엄격한 거부·메시지별 재검증은 US13(T056)에서 보강한다.
 */
@Component
public class GameRoomHandshakeInterceptor implements HandshakeInterceptor {

    public static final String ATTR_ROOM_ID = "roomId";
    public static final String ATTR_USER_ID = "userId";

    private final RealtimeTicketService realtimeTicketService;
    private final GameRoomRepository gameRoomRepository;

    public GameRoomHandshakeInterceptor(
            RealtimeTicketService realtimeTicketService, GameRoomRepository gameRoomRepository) {
        this.realtimeTicketService = realtimeTicketService;
        this.gameRoomRepository = gameRoomRepository;
    }

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Map<String, Object> attributes) {
        Long roomId = extractRoomId(request.getURI());
        String ticket = extractTicket(request.getURI());
        if (roomId == null || ticket == null) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }

        Optional<Long> userId = realtimeTicketService.consume(ticket);
        if (userId.isEmpty()) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }

        Optional<GameRoom> room = gameRoomRepository.findById(roomId);
        if (room.isEmpty() || !room.get().isParticipant(userId.get())) {
            response.setStatusCode(HttpStatus.FORBIDDEN);
            return false;
        }

        attributes.put(ATTR_ROOM_ID, roomId);
        attributes.put(ATTR_USER_ID, userId.get());
        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Exception exception) {
        // no-op
    }

    private Long extractRoomId(URI uri) {
        String path = uri.getPath();
        String lastSegment = path.substring(path.lastIndexOf('/') + 1);
        try {
            return Long.parseLong(lastSegment);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String extractTicket(URI uri) {
        return UriComponentsBuilder.fromUri(uri).build().getQueryParams().getFirst("ticket");
    }
}
