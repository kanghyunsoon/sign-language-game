package backend.ssafy.suhwa.growth.dto;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.EvolutionStage;
import backend.ssafy.suhwa.growth.domain.UserPet;

public record PetStatusResponse(
        int level,
        int currentExp,
        Integer expToNextLevel,
        EvolutionStage evolutionStage,
        int maxLevel) {

    public static PetStatusResponse from(UserPet pet, GrowthPolicyProperties policy) {
        boolean maximum = pet.getLevel() >= policy.getMaxLevel();
        return new PetStatusResponse(
                pet.getLevel(),
                pet.getExp(),
                maximum ? null : policy.getExpPerLevel() - pet.getExp(),
                pet.evolutionStage(policy.getFirstEvolutionLevel(), policy.getFinalEvolutionLevel()),
                policy.getMaxLevel());
    }
}
