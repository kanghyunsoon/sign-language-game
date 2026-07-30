package backend.ssafy.suhwa.gameresult.dto;

import backend.ssafy.suhwa.gameresult.domain.SoloSession;
import java.util.List;

public record StartSoloSessionResponse(
        String soloSessionId,
        String userId,
        String difficulty,
        List<String> symbolRange,
        String playMode,
        long startedAt) {

    public static StartSoloSessionResponse from(SoloSession session, List<String> symbolRange) {
        return new StartSoloSessionResponse(
                session.getId(),
                session.getUserId().toString(),
                session.getDifficulty(),
                List.copyOf(symbolRange),
                session.getPlayMode().name(),
                session.getStartedAt().toEpochMilli());
    }
}
