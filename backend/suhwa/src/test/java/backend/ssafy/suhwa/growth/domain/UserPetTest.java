package backend.ssafy.suhwa.growth.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class UserPetTest {

    @Test
    void experienceCarriesAcrossMultipleLevels() {
        UserPet pet = UserPet.builder().userId(1L).build();

        pet.addExperience(45, 20, 10);

        assertThat(pet.getLevel()).isEqualTo(3);
        assertThat(pet.getExp()).isEqualTo(5);
    }

    @Test
    void evolutionStageIsDerivedFromLevel() {
        UserPet pet = UserPet.builder().userId(1L).build();

        pet.addExperience(80, 20, 10);

        assertThat(pet.getLevel()).isEqualTo(5);
        assertThat(pet.evolutionStage(5, 10)).isEqualTo(EvolutionStage.STAGE_2);
    }

    @Test
    void reachingMaxLevelDiscardsOverflowAndFutureExperience() {
        UserPet pet = UserPet.builder().userId(1L).level(9).exp(19).build();

        pet.addExperience(30, 20, 10);
        pet.addExperience(100, 20, 10);

        assertThat(pet.getLevel()).isEqualTo(10);
        assertThat(pet.getExp()).isZero();
        assertThat(pet.evolutionStage(5, 10)).isEqualTo(EvolutionStage.STAGE_3);
    }
}
