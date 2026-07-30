package backend.ssafy.suhwa.learning.dto;

import backend.ssafy.suhwa.growth.dto.PetStatusResponse;

public record ActivityCompletionResponse(
        boolean completed,
        int awardedExp,
        PetStatusResponse pet) {
}
