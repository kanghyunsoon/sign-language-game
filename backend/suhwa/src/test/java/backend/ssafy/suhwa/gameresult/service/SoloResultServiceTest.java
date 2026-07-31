package backend.ssafy.suhwa.gameresult.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class SoloResultServiceTest {

    private final GrowthPolicyProperties policy = new GrowthPolicyProperties();
    private final SoloResultService service = new SoloResultService(
            mock(GameResultRepository.class), mock(GrowthRewardService.class), policy);

    @ParameterizedTest
    @CsvSource({"60,15", "61,10", "90,10", "91,5", "120,5", "121,0"})
    void rewardUsesInclusiveScoreBoundaries(int score, int expectedExperience) {
        assertThat(service.rewardFor(score)).isEqualTo(expectedExperience);
    }
}
