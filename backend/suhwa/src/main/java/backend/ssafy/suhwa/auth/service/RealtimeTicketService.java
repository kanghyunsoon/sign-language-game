package backend.ssafy.suhwa.auth.service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * 로비 SSE 연결과 방 내 WebSocket 핸드셰이크가 공통으로 사용하는 1회용 단기 인증 티켓을
 * 발급/소비한다(FR-008, FR-023, FR-024, research.md #8). 브라우저 표준 EventSource/WebSocket
 * API가 커스텀 인증 헤더를 지원하지 않아 쿼리 파라미터로 전달할 짧은 수명의 불투명 토큰이 필요하다.
 * 단일 인스턴스 운영이 전제이므로 DB 테이블 대신 인메모리 맵으로 관리한다.
 */
@Service
public class RealtimeTicketService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TOKEN_BYTES = 32;

    private final Map<String, TicketEntry> tickets = new ConcurrentHashMap<>();
    private final long ticketTtlSeconds;

    public RealtimeTicketService(@Value("${game.room.realtime-ticket-ttl}") long ticketTtlSeconds) {
        this.ticketTtlSeconds = ticketTtlSeconds;
    }

    public long ticketTtlSeconds() {
        return ticketTtlSeconds;
    }

    public String issue(Long userId) {
        String ticket = generateTicket();
        tickets.put(ticket, new TicketEntry(userId, Instant.now().plusSeconds(ticketTtlSeconds)));
        return ticket;
    }

    /** 조회 즉시 맵에서 제거해 1회성을 보장한다. 만료됐거나 이미 소비된 티켓은 빈 값을 반환한다. */
    public Optional<Long> consume(String ticket) {
        TicketEntry entry = tickets.remove(ticket);
        if (entry == null || entry.isExpired()) {
            return Optional.empty();
        }
        return Optional.of(entry.userId());
    }

    @Scheduled(fixedDelay = 60_000)
    public void evictExpired() {
        Instant now = Instant.now();
        tickets.values().removeIf(entry -> entry.expiresAt().isBefore(now));
    }

    private String generateTicket() {
        byte[] bytes = new byte[TOKEN_BYTES];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private record TicketEntry(Long userId, Instant expiresAt) {
        boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }
}
