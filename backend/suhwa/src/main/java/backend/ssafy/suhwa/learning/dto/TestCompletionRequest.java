package backend.ssafy.suhwa.learning.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record TestCompletionRequest(
        @NotNull @Min(0) Integer correctCount,
        @NotNull @Min(1) Integer totalCount) {
}
