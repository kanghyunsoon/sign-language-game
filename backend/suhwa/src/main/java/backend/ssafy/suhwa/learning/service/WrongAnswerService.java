package backend.ssafy.suhwa.learning.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.learning.domain.Sign;
import backend.ssafy.suhwa.learning.domain.SignCategory;
import backend.ssafy.suhwa.learning.domain.WrongAnswerLog;
import backend.ssafy.suhwa.learning.dto.TetrisWeightResponse;
import backend.ssafy.suhwa.learning.dto.WrongAnswerCount;
import backend.ssafy.suhwa.learning.dto.WrongAnswerResponse;
import backend.ssafy.suhwa.learning.repository.SignRepository;
import backend.ssafy.suhwa.learning.repository.TestSessionRepository;
import backend.ssafy.suhwa.learning.repository.WrongAnswerLogRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WrongAnswerService {

    private static final int RECENT_LIMIT = 5;
    private static final double BASE_WEIGHT = 1.0;
    private static final double WRONG_ANSWER_WEIGHT_INCREMENT = 0.2;
    private static final List<SignCategory> TETRIS_CATEGORIES =
            List.of(SignCategory.CONSONANT, SignCategory.VOWEL);

    private final WrongAnswerLogRepository wrongAnswerLogRepository;
    private final SignRepository signRepository;
    private final TestSessionRepository testSessionRepository;

    @Transactional
    public void reportWrongAnswer(Long userId, Long testSessionId, Long signId) {
        testSessionRepository.findByIdAndUserId(testSessionId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TEST_SESSION_NOT_FOUND));
        Sign sign = signRepository.findById(signId)
                .orElseThrow(() -> new BusinessException(ErrorCode.SIGN_NOT_FOUND));
        wrongAnswerLogRepository.save(WrongAnswerLog.builder()
                .userId(userId)
                .signId(sign.getId())
                .testSessionId(testSessionId)
                .build());
    }

    public List<WrongAnswerResponse> getRecentWrongAnswers(Long userId, SignCategory category) {
        return wrongAnswerLogRepository.findRecentByUserIdAndCategory(
                userId, category, PageRequest.of(0, RECENT_LIMIT));
    }

    public List<TetrisWeightResponse> getTetrisWeightsFromRecentTests(Long userId) {
        List<Sign> tetrisSigns =
                signRepository.findByCategoryInAndActiveTrueOrderByIdAsc(TETRIS_CATEGORIES);
        List<Long> testSessionIds = testSessionRepository
                .findByUserIdAndCompletedAtIsNotNullOrderByCompletedAtDesc(
                        userId, PageRequest.of(0, RECENT_LIMIT))
                .stream()
                .map(testSession -> testSession.getId())
                .toList();

        Map<Long, Double> weightBySignId = testSessionIds.isEmpty()
                ? Map.of()
                : wrongAnswerLogRepository.countByUserIdAndTestSessionIdsAndCategories(
                                userId, testSessionIds, TETRIS_CATEGORIES)
                        .stream()
                        .map(this::toTetrisWeight)
                        .collect(Collectors.toMap(
                                TetrisWeightResponse::signId,
                                TetrisWeightResponse::weight));

        return tetrisSigns.stream()
                .map(Sign::getId)
                .map(signId -> new TetrisWeightResponse(
                        signId, weightBySignId.getOrDefault(signId, BASE_WEIGHT)))
                .toList();
    }

    private TetrisWeightResponse toTetrisWeight(WrongAnswerCount wrongAnswerCount) {
        double weight = BASE_WEIGHT
                + wrongAnswerCount.wrongCount() * WRONG_ANSWER_WEIGHT_INCREMENT;
        return new TetrisWeightResponse(wrongAnswerCount.signId(), weight);
    }
}
