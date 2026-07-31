package backend.ssafy.suhwa.learning.dto;

import backend.ssafy.suhwa.learning.domain.TestSession;
import backend.ssafy.suhwa.growth.dto.PetStatusResponse;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

public record TestSessionResponse(
        @Schema(description = "테스트 세션 ID", example = "42")
        Long testSessionId,
        @Schema(description = "테스트 시작 시각")
        LocalDateTime startedAt,
        @Schema(description = "테스트 완료 시각. 시작 응답에서는 null", nullable = true)
        LocalDateTime completedAt,
        @Schema(description = "정답 수. 시작 응답에서는 null", example = "8", nullable = true)
        Integer correctCount,
        @Schema(description = "전체 문항 수. 시작 응답에서는 null", example = "10", nullable = true)
        Integer totalCount,
        @Schema(description = "정답률 80% 이상 여부", example = "true")
        boolean passedRewardThreshold,
        @Schema(description = "이번 완료 요청에서 지급된 펫 경험치", example = "7")
        int awardedExp,
        @Schema(description = "완료 반영 후 펫 상태. 시작 응답에서는 null", nullable = true)
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
