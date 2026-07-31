package backend.ssafy.suhwa.gameresult.service;

import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.gameresult.dto.SoloBestScore;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * `game_results`를 쓰거나 읽어야 하는 다른 모듈(game·ranking)의 단일 진입점(FR-020).
 *
 * <p>이전에는 두 모듈이 {@code GameResultRepository}를 직접 잡았고, 그 결과 "승자 1점 / 패자 0점"
 * 이라는 대전 기록 불변식이 {@code GameRoomService} 안에 인라인으로 흩어져 있었다. 그 규칙을
 * 여기로 모아 기록 형태가 한곳에서만 정해지게 한다(FR-015, {@code GameResultIntegrityTest}가
 * 검증하는 규칙과 같다).
 *
 * <p>솔로 결과 기록은 같은 모듈 안의 {@link SoloResultService}가 그대로 담당한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GameResultService {

    /** 대전 승패는 점수가 아니라 승수로 집계되므로 승자 1 / 패자 0으로 고정한다(FR-026). */
    private static final int WIN_SCORE = 1;
    private static final int LOSS_SCORE = 0;

    private final GameResultRepository gameResultRepository;
    private final GrowthRewardService growthRewardService;
    private final GrowthPolicyProperties policy;

    /**
     * 대전 결과를 승자·패자 두 행으로 기록한다. 호출자의 트랜잭션에 참여하므로, 방 상태 전이와
     * 같은 트랜잭션에서 원자적으로 처리된다.
     */
    @Transactional
    public void recordDuel(Long winnerUserId, Long loserUserId, GameResultType gameType) {
        Long firstUserId = Math.min(winnerUserId, loserUserId);
        Long secondUserId = Math.max(winnerUserId, loserUserId);
        UserPet firstPet = growthRewardService.lockPet(firstUserId);
        UserPet secondPet = growthRewardService.lockPet(secondUserId);
        UserPet winnerPet = winnerUserId.equals(firstUserId) ? firstPet : secondPet;
        UserPet loserPet = loserUserId.equals(firstUserId) ? firstPet : secondPet;

        gameResultRepository.save(GameResult.builder()
                .userId(winnerUserId).gameType(gameType).score(WIN_SCORE).build());
        gameResultRepository.save(GameResult.builder()
                .userId(loserUserId).gameType(gameType).score(LOSS_SCORE).build());
        growthRewardService.rewardLocked(winnerPet, policy.getDuelWinnerExp());
        growthRewardService.rewardLocked(loserPet, policy.getDuelLoserExp());
    }

    /** 랭킹 집계 원본. 해당 게임 종류의 기록 전체를 돌려준다. */
    public List<GameResult> findByGameType(GameResultType gameType) {
        return gameResultRepository.findByGameType(gameType);
    }

    public List<SoloBestScore> findBestScoresByGameType(GameResultType gameType) {
        return gameResultRepository.findBestScoresByGameType(gameType);
    }
}
