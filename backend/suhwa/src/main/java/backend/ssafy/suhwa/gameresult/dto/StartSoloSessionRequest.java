package backend.ssafy.suhwa.gameresult.dto;

import backend.ssafy.suhwa.gameresult.domain.SoloPlayMode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record StartSoloSessionRequest(
        @NotBlank String difficulty,
        @NotEmpty List<@NotBlank String> symbolRange,
        @NotNull SoloPlayMode playMode) {
}
