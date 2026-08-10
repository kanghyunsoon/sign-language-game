package backend.ssafy.suhwa.growth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.gameresult.service.SoloResultService;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.repository.UserPetRepository;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.growth.service.PetGrowthService;
import backend.ssafy.suhwa.user.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Import({
        SoloResultService.class,
        GrowthRewardService.class,
        PetGrowthService.class,
        GrowthPolicyProperties.class
})
class GrowthRewardIntegrationTest {

    @Autowired private SoloResultService soloResultService;
    @Autowired private GameResultRepository gameResultRepository;
    @Autowired private UserPetRepository userPetRepository;
    @MockitoBean private UserService userService;

    @AfterEach
    void cleanUp() {
        gameResultRepository.deleteAll();
        userPetRepository.deleteAll();
    }

    @Test
    void reportingSoloResultPersistsScoreAndRewardsPetTogether() {
        userPetRepository.save(UserPet.builder().userId(1L).build());

        soloResultService.report(1L, 60);

        assertThat(gameResultRepository.findAll())
                .singleElement()
                .satisfies(result -> {
                    assertThat(result.getGameType()).isEqualTo(GameResultType.TETRIS_SOLO);
                    assertThat(result.getScore()).isEqualTo(60);
                });
        assertThat(userPetRepository.findByUserId(1L).orElseThrow().getExp()).isEqualTo(15);
    }

    @Test
    void missingPetRollsBackSoloResult() {
        assertThatThrownBy(() -> soloResultService.report(2L, 60))
                .isInstanceOf(BusinessException.class);
        assertThat(gameResultRepository.findAll()).isEmpty();
    }
}
