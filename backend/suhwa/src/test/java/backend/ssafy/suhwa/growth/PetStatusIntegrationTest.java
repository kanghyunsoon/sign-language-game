package backend.ssafy.suhwa.growth;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.EvolutionStage;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import backend.ssafy.suhwa.growth.service.PetGrowthService;
import backend.ssafy.suhwa.growth.service.PetQueryService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.service.UserService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.mockito.BDDMockito.given;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Import({
        PetGrowthService.class,
        PetQueryService.class,
        PetStatusIntegrationTest.Config.class
})
class PetStatusIntegrationTest {

    @Autowired
    private PetGrowthService petGrowthService;

    @Autowired
    private PetQueryService petQueryService;

    @MockitoBean
    private UserService userService;

    @Test
    void signupLikeCreationAndFollowingRewardAreImmediatelyVisible() {
        given(userService.getActiveUser(1L)).willReturn(User.builder()
                .email("pet@test.com").passwordHash("h").nickname("pet").build());
        petGrowthService.createInitialPet(1L);

        PetStatusResponse initial = petQueryService.getStatus(1L);
        assertThat(initial.level()).isEqualTo(1);
        assertThat(initial.currentExp()).isZero();

        petGrowthService.addExperience(petGrowthService.lockPet(1L), 90);

        PetStatusResponse grown = petQueryService.getStatus(1L);
        assertThat(grown.level()).isEqualTo(5);
        assertThat(grown.currentExp()).isEqualTo(10);
        assertThat(grown.evolutionStage()).isEqualTo(EvolutionStage.STAGE_2);
    }

    @TestConfiguration
    static class Config {

        @Bean
        GrowthPolicyProperties growthPolicyProperties() {
            return new GrowthPolicyProperties();
        }
    }
}
