package backend.ssafy.suhwa.gameresult.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record SoloResultResponse(
        @Schema(description = "저장된 게임 결과 ID", example = "123")
        Long resultId,
        @Schema(description = "저장된 솔로 게임 진행 시간(초)", example = "90")
        int score) {
}
