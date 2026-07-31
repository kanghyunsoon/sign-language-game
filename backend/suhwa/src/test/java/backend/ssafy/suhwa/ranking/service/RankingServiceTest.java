package backend.ssafy.suhwa.ranking.service;

import static org.assertj.core.api.Assertions.assertThat;

import backend.ssafy.suhwa.auth.service.RefreshTokenService;
import backend.ssafy.suhwa.common.config.JpaAuditingConfig;
import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.gameresult.service.GameResultService;
import backend.ssafy.suhwa.growth.service.PetGrowthService;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.ranking.dto.RankingResponse;
import backend.ssafy.suhwa.user.domain.User;
import backend.ssafy.suhwa.user.repository.UserRepository;
import backend.ssafy.suhwa.user.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@Import(JpaAuditingConfig.class)
class RankingServiceTest {

    @Autowired
    private GameResultRepository gameResultRepository;

    @Autowired
    private UserRepository userRepository;

    private RankingService rankingService;

    @BeforeEach
    void setUp() {
        // RankingService는 이제 UserRepository를 직접 잡지 않고 UserService를 거친다(모듈 경계, FR-020).
        // 이 슬라이스 테스트에는 서비스 빈이 없으므로, 실제 조회 경로만 살리고 랭킹과 무관한
        // 협력자(토큰 폐기·비밀번호 해싱)는 목으로 채운다.
        UserService userService = new UserService(
                userRepository,
                Mockito.mock(RefreshTokenService.class),
                Mockito.mock(PasswordEncoder.class),
                Mockito.mock(PetGrowthService.class),
                Mockito.mock(PlatformTransactionManager.class));
        rankingService = new RankingService(
                new GameResultService(
                        gameResultRepository,
                        Mockito.mock(GrowthRewardService.class),
                        new GrowthPolicyProperties()),
                userService);
    }

    private Long createUser(String label) {
        return userRepository.save(User.builder()
                        .email(label + "-" + System.nanoTime() + "@test.com").passwordHash("h").nickname(label)
                        .build())
                .getId();
    }

    private void record(Long userId, GameResultType gameType, int score) {
        gameResultRepository.save(GameResult.builder().userId(userId).gameType(gameType).score(score).build());
    }

    @Test
    void differentGameTypesAreCompletelyIsolated() {
        Long userId = createUser("isolated");
        record(userId, GameResultType.SIGN_DUEL, 1);
        record(userId, GameResultType.TETRIS_DUEL, 1);
        record(userId, GameResultType.TETRIS_DUEL, 1);

        RankingResponse signDuel = rankingService.getRankings(userId, GameResultType.SIGN_DUEL);
        RankingResponse tetrisDuel = rankingService.getRankings(userId, GameResultType.TETRIS_DUEL);

        assertThat(signDuel.me().score()).isEqualTo(1);
        assertThat(tetrisDuel.me().score()).isEqualTo(2);
    }

    @Test
    void duelRanking_tiedWinCount_ordersByFewerLosses() {
        Long lowLoss = createUser("lowloss");
        Long highLoss = createUser("highloss");
        // 둘 다 2승이지만 lowLoss는 0패, highLoss는 1패다.
        record(lowLoss, GameResultType.SIGN_DUEL, 1);
        record(lowLoss, GameResultType.SIGN_DUEL, 1);
        record(highLoss, GameResultType.SIGN_DUEL, 1);
        record(highLoss, GameResultType.SIGN_DUEL, 1);
        record(highLoss, GameResultType.SIGN_DUEL, 0);

        RankingResponse response = rankingService.getRankings(lowLoss, GameResultType.SIGN_DUEL);

        assertThat(response.top()).extracting(r -> r.userId())
                .containsExactly(lowLoss, highLoss);
    }

    @Test
    void soloRanking_usesEachUsersMinimumScoreAndSharedCompetitionRanks() {
        Long fastUser = createUser("fast");
        Long equallyFastUser = createUser("equally-fast");
        Long slowUser = createUser("slow");
        record(fastUser, GameResultType.TETRIS_SOLO, 100);
        record(fastUser, GameResultType.TETRIS_SOLO, 90);
        record(equallyFastUser, GameResultType.TETRIS_SOLO, 90);
        record(slowUser, GameResultType.TETRIS_SOLO, 110);

        RankingResponse response = rankingService.getRankings(fastUser, GameResultType.TETRIS_SOLO);

        assertThat(response.top()).extracting(entry -> entry.rank())
                .containsExactly(1, 1, 3);
        assertThat(response.top()).extracting(entry -> entry.score())
                .containsExactly(90, 90, 110);
        assertThat(response.me().score()).isEqualTo(90);
        assertThat(response.me().rank()).isEqualTo(1);
    }

    @Test
    void neverPlayed_meIsNull() {
        Long userId = createUser("neverplayed");

        RankingResponse response = rankingService.getRankings(userId, GameResultType.SIGN_DUEL);

        assertThat(response.me()).isNull();
    }
}
