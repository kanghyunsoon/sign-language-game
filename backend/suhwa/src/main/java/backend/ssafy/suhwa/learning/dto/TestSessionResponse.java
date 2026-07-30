package backend.ssafy.suhwa.learning.dto;

import backend.ssafy.suhwa.learning.domain.TestSession;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import java.time.LocalDateTime;

public record TestSessionResponse(
        Long testSessionId,
        LocalDateTime startedAt,
        LocalDateTime completedAt,
        Integer correctCount,
        Integer totalCount,
        boolean passedRewardThreshold,
        int awardedExp,
        PetStatusResponse pet) {

    public static TestSessionResponse from(TestSession testSession) {
        return new TestSessionResponse(
                testSession.getId(),
                testSession.getStartedAt(),
                testSession.getCompletedAt(),
                testSession.getCorrectCount(),
                testSession.getTotalCount(),
                testSession.passedRewardThreshold(),
                0,
                null);
    }

    public static TestSessionResponse completed(
            TestSession testSession, int awardedExp, PetStatusResponse pet) {
        return new TestSessionResponse(
                testSession.getId(),
                testSession.getStartedAt(),
                testSession.getCompletedAt(),
                testSession.getCorrectCount(),
                testSession.getTotalCount(),
                testSession.passedRewardThreshold(),
                awardedExp,
                pet);
    }
}
