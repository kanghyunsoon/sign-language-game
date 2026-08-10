package backend.ssafy.suhwa.learning.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.learning.domain.TestSession;
import backend.ssafy.suhwa.learning.repository.TestSessionRepository;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.learning.dto.TestSessionResponse;
import java.time.Clock;
import java.time.LocalDateTime;
import backend.ssafy.suhwa.user.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TestSessionService {

    private final TestSessionRepository testSessionRepository;
    private final GrowthRewardService growthRewardService;
    private final GrowthPolicyProperties policy;
    private final Clock clock;
    private final UserService userService;

    @Transactional
    public TestSession startTest(Long userId) {
        userService.getActiveUser(userId);
        return testSessionRepository.save(
                TestSession.builder()
                        .userId(userId)
                        .build());
    }

    @Transactional
    public TestSessionResponse completeTest(
            Long userId, Long testSessionId, int correctCount, int totalCount) {
        userService.getActiveUser(userId);
        if (totalCount < 1 || correctCount < 0 || correctCount > totalCount) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }

        TestSession testSession = testSessionRepository.findByIdForUpdate(testSessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACTIVITY_SESSION_NOT_FOUND));
        if (!testSession.getUserId().equals(userId)) {
            throw new BusinessException(ErrorCode.ACTIVITY_SESSION_ACCESS_DENIED);
        }
        if (testSession.isCompleted()) {
            if (!testSession.hasSameResult(correctCount, totalCount)) {
                throw new BusinessException(ErrorCode.ACTIVITY_COMPLETION_CONFLICT);
            }
            UserPet pet = growthRewardService.lockPet(userId);
            return TestSessionResponse.completed(
                    testSession, 0, PetStatusResponse.from(pet, policy));
        }

        testSession.complete(LocalDateTime.now(clock), correctCount, totalCount);
        UserPet pet = growthRewardService.lockPet(userId);
        int awardedExp = testSession.passedRewardThreshold() ? policy.getTestExp() : 0;
        growthRewardService.rewardLocked(pet, awardedExp);
        return TestSessionResponse.completed(
                testSession, awardedExp, PetStatusResponse.from(pet, policy));
    }
}
