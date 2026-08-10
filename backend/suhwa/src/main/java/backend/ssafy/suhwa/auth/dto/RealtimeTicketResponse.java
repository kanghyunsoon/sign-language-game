package backend.ssafy.suhwa.auth.dto;

public record RealtimeTicketResponse(String ticket, long expiresInSeconds) {
}
