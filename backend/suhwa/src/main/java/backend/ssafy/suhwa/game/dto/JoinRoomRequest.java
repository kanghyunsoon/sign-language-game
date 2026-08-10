package backend.ssafy.suhwa.game.dto;

import jakarta.validation.constraints.NotBlank;

public record JoinRoomRequest(@NotBlank String roomCode) {
}
