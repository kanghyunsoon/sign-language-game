package backend.ssafy.suhwa.gameresult.service;

import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.dto.SoloResultResponse;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
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

    public SoloResultService(GameResultRepository gameResultRepository) {
        this.gameResultRepository = gameResultRepository;
    }

    public SoloResultResponse report(Long userId, int score) {
        GameResult saved = gameResultRepository.save(GameResult.builder()
                .userId(userId)
                .gameType(GameResultType.TETRIS_SOLO)
                .score(score)
                .build());
        return new SoloResultResponse(saved.getId(), saved.getScore());
    }
}
