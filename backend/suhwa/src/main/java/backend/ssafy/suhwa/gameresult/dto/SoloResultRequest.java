package backend.ssafy.suhwa.gameresult.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record SoloResultRequest(
        @Schema(description = "솔로 게임 진행 시간(초). 낮을수록 좋은 기록", example = "90", minimum = "1")
        @NotNull @Min(1) Integer score) {
}
