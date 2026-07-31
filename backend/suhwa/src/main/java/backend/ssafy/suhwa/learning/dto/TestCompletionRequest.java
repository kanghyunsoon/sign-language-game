package backend.ssafy.suhwa.learning.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record TestCompletionRequest(
        @Schema(description = "정답 수", example = "8", minimum = "0")
        @NotNull @Min(0) Integer correctCount,
        @Schema(description = "전체 문항 수", example = "10", minimum = "1")
        @NotNull @Min(1) Integer totalCount) {
}
