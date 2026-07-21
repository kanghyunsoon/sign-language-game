package backend.ssafy.suhwa.game.dto;

import jakarta.validation.constraints.NotNull;

public record ReadyRequest(@NotNull Boolean isReady) {
}
