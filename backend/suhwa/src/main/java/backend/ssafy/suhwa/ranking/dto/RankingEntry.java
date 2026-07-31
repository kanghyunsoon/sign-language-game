package backend.ssafy.suhwa.ranking.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record RankingEntry(
        @Schema(description = "순위. 솔로에서는 같은 최소 score가 같은 순위", example = "1")
        int rank,
        @Schema(description = "사용자 ID", example = "12")
        Long userId,
        @Schema(description = "사용자 닉네임", example = "수어왕")
        String nickname,
        @Schema(description = "대전 승수 또는 솔로 최소 진행 시간(초)", example = "75")
        int score) {
}
