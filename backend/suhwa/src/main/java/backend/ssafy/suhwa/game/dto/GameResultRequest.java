package backend.ssafy.suhwa.game.dto;

import io.swagger.v3.oas.annotations.media.Schema;

/** 001의 hostScore/guestScore 방식을 대체(FR-021/033). 생략하거나 null이면 무승부. */
public record GameResultRequest(
        @Schema(description = "승자 사용자 ID. null이면 무승부", example = "12", nullable = true)
        Long winnerUserId) {
}
