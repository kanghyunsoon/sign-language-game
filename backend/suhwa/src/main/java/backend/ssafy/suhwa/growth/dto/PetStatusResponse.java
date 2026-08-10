package backend.ssafy.suhwa.growth.dto;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.EvolutionStage;
import backend.ssafy.suhwa.growth.domain.UserPet;
import io.swagger.v3.oas.annotations.media.Schema;

public record PetStatusResponse(
        @Schema(description = "현재 펫 레벨", example = "7", minimum = "1", maximum = "20")
        int level,
        @Schema(description = "현재 레벨에서 누적된 경험치", example = "12", minimum = "0", maximum = "19")
        int currentExp,
        @Schema(description = "다음 레벨까지 필요한 경험치. 20레벨이면 null", example = "8", nullable = true)
        Integer expToNextLevel,
        @Schema(description = "현재 레벨에 따른 자동 진화 단계", example = "STAGE_2")
        EvolutionStage evolutionStage,
        @Schema(description = "최대 레벨", example = "20")
        int maxLevel) {

    public static PetStatusResponse from(UserPet pet, GrowthPolicyProperties policy) {
        boolean maximum = pet.getLevel() >= policy.getMaxLevel();
        return new PetStatusResponse(
                pet.getLevel(),
                pet.getExp(),
                maximum ? null : policy.getExpPerLevel() - pet.getExp(),
                pet.evolutionStage(
                        policy.getFirstEvolutionLevel(),
                        policy.getSecondEvolutionLevel(),
                        policy.getThirdEvolutionLevel(),
                        policy.getFinalEvolutionLevel()),
                policy.getMaxLevel());
    }
}
