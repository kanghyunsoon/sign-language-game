package backend.ssafy.suhwa.learning.dto;

import jakarta.validation.constraints.NotNull;

public record WrongAnswerRequest(@NotNull Long signId) {
}
