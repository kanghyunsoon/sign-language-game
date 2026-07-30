package backend.ssafy.suhwa.gameresult.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record SoloSymbolStatisticRequest(
        @NotBlank String symbol,
        @Min(0) int correctCount,
        @Min(0) int incorrectCount,
        @Min(0) int confirmedCount) {
}
