package backend.ssafy.suhwa.learning.dto;

import backend.ssafy.suhwa.learning.domain.PracticeSession;
import java.time.LocalDateTime;

public record PracticeSessionResponse(
        Long practiceSessionId,
        LocalDateTime startedAt,
        boolean completed) {

    public static PracticeSessionResponse from(PracticeSession session) {
        return new PracticeSessionResponse(
                session.getId(),
                session.getStartedAt(),
                session.isCompleted());
    }
}
