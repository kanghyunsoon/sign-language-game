package backend.ssafy.suhwa.game.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** 001 스키마에서 hostScore/guestScore, gameSessionId 제거 — game_sessions 자체가 없어졌다(research.md #8). */
public record GameResultResponse(
        @Schema(description = "확정된 승자 사용자 ID. 무승부이면 null", example = "12", nullable = true)
        Long winnerUserId) {
}
