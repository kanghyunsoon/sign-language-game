package backend.ssafy.suhwa.game.dto;

/** 001 스키마에서 hostScore/guestScore, gameSessionId 제거 — game_sessions 자체가 없어졌다(research.md #8). */
public record GameResultResponse(Long winnerUserId) {
}
