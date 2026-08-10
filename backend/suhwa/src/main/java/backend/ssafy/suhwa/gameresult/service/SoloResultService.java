package backend.ssafy.suhwa.gameresult.service;

import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.dto.SoloResultResponse;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 게임방 개념과 완전히 무관한 솔로 결과 저장(FR-027/028). 검증·중복 방지 없이 곧바로 기록한다
 * (spec.md Assumptions, 의도적 결정 — 점수 조작 가능성을 의식적으로 감수한다).
 */
@Service
@Transactional
public class SoloResultService {

    private final GameResultRepository gameResultRepository;
    private final GrowthRewardService growthRewardService;
    private final GrowthPolicyProperties policy;

    public SoloResultService(
            GameResultRepository gameResultRepository,
            GrowthRewardService growthRewardService,
            GrowthPolicyProperties policy) {
        this.gameResultRepository = gameResultRepository;
        this.growthRewardService = growthRewardService;
        this.policy = policy;
    }

    public SoloResultResponse report(Long userId, int score) {
        UserPet pet = growthRewardService.lockPet(userId);
        GameResult saved = gameResultRepository.save(GameResult.builder()
                .userId(userId)
                .gameType(GameResultType.TETRIS_SOLO)
                .score(score)
                .build());
        growthRewardService.rewardLocked(pet, rewardFor(score));
        return new SoloResultResponse(saved.getId(), saved.getScore());
    }

    int rewardFor(int score) {
        if (score <= policy.getSoloFastScoreMax()) {
            return policy.getSoloFastExp();
        }
        if (score <= policy.getSoloMediumScoreMax()) {
            return policy.getSoloMediumExp();
        }
        if (score <= policy.getSoloSlowScoreMax()) {
            return policy.getSoloSlowExp();
        }
        return 0;
    }
}
