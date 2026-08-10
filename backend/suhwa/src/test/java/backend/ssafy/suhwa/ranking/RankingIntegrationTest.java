package backend.ssafy.suhwa.ranking;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import backend.ssafy.suhwa.ranking.service.RankingService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class RankingIntegrationTest {

    @Autowired private GameResultRepository gameResultRepository;
    @Autowired private UserRepository userRepository;

    @Test
    void ranksMinimumScoresAscendingWithCompetitionRanks() {
        Long first = createUser("first");
        Long tied = createUser("tied");
        Long third = createUser("third");
        save(first, 100);
        save(first, 90);
        save(tied, 90);
        save(third, 110);

        RankingResponse response = rankingService().getRankings(third, GameResultType.TETRIS_SOLO);

        assertThat(response.top()).extracting(entry -> entry.score())
                .containsExactly(90, 90, 110);
        assertThat(response.top()).extracting(entry -> entry.rank())
                .containsExactly(1, 1, 3);
        assertThat(response.me().rank()).isEqualTo(3);
        assertThat(response.me().score()).isEqualTo(110);
    }

    private RankingService rankingService() {
        GameResultService gameResultService = new GameResultService(
                gameResultRepository,
                Mockito.mock(GrowthRewardService.class),
                new GrowthPolicyProperties());
        return new RankingService(gameResultService);
    }

    private Long createUser(String nickname) {
        return userRepository.save(User.builder()
                        .email(nickname + "-" + System.nanoTime() + "@test.com")
                        .passwordHash("h")
                        .nickname(nickname)
                        .build())
                .getId();
    }

    private void save(Long userId, int score) {
        gameResultRepository.save(GameResult.builder()
                .userId(userId)
                .gameType(GameResultType.TETRIS_SOLO)
                .score(score)
                .build());
    }
}
