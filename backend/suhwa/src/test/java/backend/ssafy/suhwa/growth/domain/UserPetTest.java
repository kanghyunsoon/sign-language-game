package backend.ssafy.suhwa.growth.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class UserPetTest {

    @Test
    void experienceCarriesAcrossMultipleLevels() {
        UserPet pet = UserPet.builder().userId(1L).build();

        pet.addExperience(45, 20, 20);

        assertThat(pet.getLevel()).isEqualTo(3);
        assertThat(pet.getExp()).isEqualTo(5);
    }

    @Test
    void evolutionStageIsDerivedFromFiveLevelRanges() {
        assertThat(stageAt(1)).isEqualTo(EvolutionStage.STAGE_1);
        assertThat(stageAt(4)).isEqualTo(EvolutionStage.STAGE_1);
        assertThat(stageAt(5)).isEqualTo(EvolutionStage.STAGE_2);
        assertThat(stageAt(9)).isEqualTo(EvolutionStage.STAGE_2);
        assertThat(stageAt(10)).isEqualTo(EvolutionStage.STAGE_3);
        assertThat(stageAt(14)).isEqualTo(EvolutionStage.STAGE_3);
        assertThat(stageAt(15)).isEqualTo(EvolutionStage.STAGE_4);
        assertThat(stageAt(19)).isEqualTo(EvolutionStage.STAGE_4);
        assertThat(stageAt(20)).isEqualTo(EvolutionStage.STAGE_5);
    }

    @Test
    void legacyLevelTenPetKeepsProgressAndCanGrowAgain() {
        UserPet pet = UserPet.builder().userId(1L).level(10).exp(7).build();

        pet.addExperience(13, 20, 20);

        assertThat(pet.getLevel()).isEqualTo(11);
        assertThat(pet.getExp()).isZero();
        assertThat(pet.evolutionStage(5, 10, 15, 20)).isEqualTo(EvolutionStage.STAGE_3);
    }

    @Test
    void reachingMaxLevelDiscardsOverflowAndFutureExperience() {
        UserPet pet = UserPet.builder().userId(1L).level(19).exp(19).build();

        pet.addExperience(30, 20, 20);
        pet.addExperience(100, 20, 20);

        assertThat(pet.getLevel()).isEqualTo(20);
        assertThat(pet.getExp()).isZero();
        assertThat(pet.evolutionStage(5, 10, 15, 20)).isEqualTo(EvolutionStage.STAGE_5);
    }

    private EvolutionStage stageAt(int level) {
        return UserPet.builder()
                .userId(1L)
                .level(level)
                .exp(0)
                .build()
                .evolutionStage(5, 10, 15, 20);
    }
}
