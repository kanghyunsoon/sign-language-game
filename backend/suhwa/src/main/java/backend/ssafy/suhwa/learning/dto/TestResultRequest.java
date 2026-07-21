package backend.ssafy.suhwa.learning.dto;

import backend.ssafy.suhwa.learning.domain.SignCategory;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record TestResultRequest(
        @NotNull SignCategory category,
        @NotNull @Min(0) Integer totalCount,
        @NotNull @Min(0) Integer correctCount) {
}
