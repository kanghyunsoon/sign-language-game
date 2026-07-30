package backend.ssafy.suhwa.gameresult.dto;

import backend.ssafy.suhwa.gameresult.domain.SoloSession;
import backend.ssafy.suhwa.gameresult.domain.SoloSymbolStatistic;
import java.util.List;

public record SoloGameResult(
        String soloSessionId,
        String userId,
        String playMode,
        String difficulty,
        int finalScore,
        int maxCombo,
        int removedSymbolCount,
        long playDurationMs,
        List<SoloSymbolStatisticRequest> symbolStatistics,
        long startedAt,
        long endedAt,
        int awardedExp) {

    public static SoloGameResult from(
            SoloSession session, List<SoloSymbolStatistic> statistics, int awardedExp) {
        return new SoloGameResult(
                session.getId(),
                session.getUserId().toString(),
                session.getPlayMode().name(),
                session.getDifficulty(),
                session.getFinalScore(),
                session.getMaxCombo(),
                session.getRemovedSymbolCount(),
                session.getPlayDurationMs(),
                statistics.stream()
                        .map(statistic -> new SoloSymbolStatisticRequest(
                                statistic.getSymbol(),
                                statistic.getCorrectCount(),
                                statistic.getIncorrectCount(),
                                statistic.getConfirmedCount()))
                        .toList(),
                session.getStartedAt().toEpochMilli(),
                session.getEndedAt().toEpochMilli(),
                awardedExp);
    }
}
