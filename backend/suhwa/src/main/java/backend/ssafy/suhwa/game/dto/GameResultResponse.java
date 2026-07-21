package backend.ssafy.suhwa.game.dto;

public record GameResultResponse(Long gameSessionId, Long winnerUserId, int hostScore, int guestScore) {
}
