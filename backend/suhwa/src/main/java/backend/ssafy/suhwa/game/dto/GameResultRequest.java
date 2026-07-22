package backend.ssafy.suhwa.game.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record GameResultRequest(
        @NotNull @Min(0) Integer hostScore,
        @NotNull @Min(0) Integer guestScore) {
}
