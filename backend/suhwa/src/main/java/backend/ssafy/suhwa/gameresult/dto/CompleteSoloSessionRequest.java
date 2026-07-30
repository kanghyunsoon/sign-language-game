package backend.ssafy.suhwa.gameresult.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CompleteSoloSessionRequest(
        @Min(0) int finalScore,
        @Min(0) int maxCombo,
        @Min(0) int removedSymbolCount,
        @Min(0) long playDurationMs,
        @NotNull List<@Valid SoloSymbolStatisticRequest> symbolStatistics,
        @Min(0) long endedAt) {
}
