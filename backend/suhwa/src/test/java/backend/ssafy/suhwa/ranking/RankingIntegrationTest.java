package backend.ssafy.suhwa.ranking;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.auth.service.RefreshTokenService;
import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.growth.service.PetGrowthService;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import backend.ssafy.suhwa.ranking.service.RankingService;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import backend.ssafy.suhwa.user.service.UserService;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class RankingIntegrationTest {

    @Autowired
    private GameResultRepository gameResultRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void ranksEachUsersFastestTimedRunAndExcludesLegacyRows() {
        Long first = createUser("first");
        Long second = createUser("second");
        Long legacy = createUser("legacy");
        saveTimed(first, 100, 95_000, "first-1");
        saveTimed(first, 200, 90_000, "first-2");
        saveTimed(second, 999, 100_000, "second-1");
        gameResultRepository.save(GameResult.builder()
                .userId(legacy)
                .gameType(GameResultType.TETRIS_SOLO)
                .score(10_000)
                .build());

        RankingResponse response = rankingService().getRankings(first, GameResultType.TETRIS_SOLO);

        assertThat(response.top()).extracting(entry -> entry.userId())
                .containsExactly(first, second);
        assertThat(response.top()).extracting(entry -> entry.playDurationMs())
                .containsExactly(90_000L, 100_000L);
        assertThat(response.me().rank()).isEqualTo(1);
        assertThat(response.me().score()).isEqualTo(200);
    }

    private RankingService rankingService() {
        UserService userService = new UserService(
                userRepository,
                Mockito.mock(RefreshTokenService.class),
                Mockito.mock(PasswordEncoder.class),
                Mockito.mock(PetGrowthService.class),
                transactionManager);
        GameResultService gameResultService = new GameResultService(
                gameResultRepository,
                Mockito.mock(GrowthRewardService.class),
                new GrowthPolicyProperties());
        return new RankingService(gameResultService, userService);
    }

    private Long createUser(String nickname) {
        return userRepository.save(User.builder()
                        .email(nickname + "-" + System.nanoTime() + "@test.com")
                        .passwordHash("h")
                        .nickname(nickname)
                        .build())
                .getId();
    }

    private void saveTimed(Long userId, int score, long duration, String sessionId) {
        gameResultRepository.save(GameResult.builder()
                .userId(userId)
                .gameType(GameResultType.TETRIS_SOLO)
                .score(score)
                .soloSessionId(sessionId)
                .playDurationMs(duration)
                .build());
    }
}
