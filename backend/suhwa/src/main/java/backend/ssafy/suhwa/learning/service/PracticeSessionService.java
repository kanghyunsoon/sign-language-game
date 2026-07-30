package backend.ssafy.suhwa.learning.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.learning.domain.PracticeSession;
import backend.ssafy.suhwa.learning.dto.ActivityCompletionResponse;
import backend.ssafy.suhwa.learning.repository.PracticeSessionRepository;
import backend.ssafy.suhwa.user.service.UserService;
import java.time.Clock;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PracticeSessionService {

    private final PracticeSessionRepository practiceSessionRepository;
    private final GrowthRewardService growthRewardService;
    private final GrowthPolicyProperties policy;
    private final Clock clock;
    private final UserService userService;

    @Transactional
    public PracticeSession start(Long userId) {
        userService.getActiveUser(userId);
        return practiceSessionRepository.save(PracticeSession.builder().userId(userId).build());
    }

    @Transactional
    public ActivityCompletionResponse complete(Long userId, Long sessionId) {
        userService.getActiveUser(userId);
        PracticeSession session = practiceSessionRepository.findByIdForUpdate(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACTIVITY_SESSION_NOT_FOUND));
        requireOwner(session.getUserId(), userId);

        UserPet pet = growthRewardService.lockPet(userId);
        int awardedExp = 0;
        if (!session.isCompleted()) {
            session.complete(LocalDateTime.now(clock));
            awardedExp = policy.getPracticeExp();
            growthRewardService.rewardLocked(pet, awardedExp);
        }
        return new ActivityCompletionResponse(
                true, awardedExp, PetStatusResponse.from(pet, policy));
    }

    private void requireOwner(Long ownerId, Long userId) {
        if (!ownerId.equals(userId)) {
            throw new BusinessException(ErrorCode.ACTIVITY_SESSION_ACCESS_DENIED);
        }
    }
}
