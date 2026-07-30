package backend.ssafy.suhwa.gameresult.service;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.GameResultType;
import backend.ssafy.suhwa.gameresult.domain.SoloSession;
import backend.ssafy.suhwa.gameresult.domain.SoloSessionSymbol;
import backend.ssafy.suhwa.gameresult.domain.SoloSymbolStatistic;
import backend.ssafy.suhwa.gameresult.dto.CompleteSoloSessionRequest;
import backend.ssafy.suhwa.gameresult.dto.SoloGameResult;
import backend.ssafy.suhwa.gameresult.dto.SoloSymbolStatisticRequest;
import backend.ssafy.suhwa.gameresult.dto.StartSoloSessionRequest;
import backend.ssafy.suhwa.gameresult.dto.StartSoloSessionResponse;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.gameresult.repository.SoloSessionRepository;
import backend.ssafy.suhwa.gameresult.repository.SoloSessionSymbolRepository;
import backend.ssafy.suhwa.gameresult.repository.SoloSymbolStatisticRepository;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import backend.ssafy.suhwa.user.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SoloSessionService {

    private static final long FAST_LIMIT_MS = 90_000;
    private static final long MEDIUM_LIMIT_MS = 105_000;
    private static final long SLOW_LIMIT_MS = 120_000;

    private final SoloSessionRepository soloSessionRepository;
    private final SoloSessionSymbolRepository soloSessionSymbolRepository;
    private final SoloSymbolStatisticRepository soloSymbolStatisticRepository;
    private final GameResultRepository gameResultRepository;
    private final GrowthRewardService growthRewardService;
    private final GrowthPolicyProperties policy;
    private final Clock clock;
    private final UserService userService;

    @Transactional
    public StartSoloSessionResponse start(Long userId, StartSoloSessionRequest request) {
        userService.getActiveUser(userId);
        SoloSession session = soloSessionRepository.save(SoloSession.builder()
                .id(UUID.randomUUID().toString())
                .userId(userId)
                .difficulty(request.difficulty())
                .playMode(request.playMode())
                .startedAt(clock.instant())
                .build());
        for (int index = 0; index < request.symbolRange().size(); index++) {
            soloSessionSymbolRepository.save(SoloSessionSymbol.builder()
                    .soloSessionId(session.getId())
                    .position(index)
                    .symbol(request.symbolRange().get(index))
                    .build());
        }
        return StartSoloSessionResponse.from(session, request.symbolRange());
    }

    @Transactional
    public SoloGameResult complete(
            Long userId, String sessionId, CompleteSoloSessionRequest request) {
        userService.getActiveUser(userId);
        validateStatistics(request.symbolStatistics());
        SoloSession session = soloSessionRepository.findByIdForUpdate(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ACTIVITY_SESSION_NOT_FOUND));
        requireOwner(session.getUserId(), userId);

        List<SoloSymbolStatistic> storedStatistics =
                soloSymbolStatisticRepository.findBySoloSessionIdOrderBySymbol(sessionId);
        Instant endedAt = Instant.ofEpochMilli(request.endedAt());
        if (session.isCompleted()) {
            if (!session.hasSameResult(
                            request.finalScore(),
                            request.maxCombo(),
                            request.removedSymbolCount(),
                            request.playDurationMs(),
                            endedAt)
                    || !sameStatistics(storedStatistics, request.symbolStatistics())) {
                throw new BusinessException(ErrorCode.ACTIVITY_COMPLETION_CONFLICT);
            }
            return SoloGameResult.from(session, storedStatistics, 0);
        }

        session.complete(
                request.finalScore(),
                request.maxCombo(),
                request.removedSymbolCount(),
                request.playDurationMs(),
                endedAt,
                clock.instant());
        storedStatistics = request.symbolStatistics().stream()
                .map(statistic -> soloSymbolStatisticRepository.save(
                        SoloSymbolStatistic.builder()
                                .soloSessionId(sessionId)
                                .symbol(statistic.symbol())
                                .correctCount(statistic.correctCount())
                                .incorrectCount(statistic.incorrectCount())
                                .confirmedCount(statistic.confirmedCount())
                                .build()))
                .sorted(Comparator.comparing(SoloSymbolStatistic::getSymbol))
                .toList();
        gameResultRepository.save(GameResult.builder()
                .userId(userId)
                .gameType(GameResultType.TETRIS_SOLO)
                .score(request.finalScore())
                .soloSessionId(sessionId)
                .playDurationMs(request.playDurationMs())
                .build());

        int awardedExp = rewardFor(request.playDurationMs());
        UserPet pet = growthRewardService.lockPet(userId);
        growthRewardService.rewardLocked(pet, awardedExp);
        return SoloGameResult.from(session, storedStatistics, awardedExp);
    }

    public List<SoloGameResult> findCompleted(Long userId) {
        userService.getActiveUser(userId);
        return soloSessionRepository.findByUserIdAndCompletedAtIsNotNullOrderByCompletedAtDesc(userId)
                .stream()
                .map(session -> SoloGameResult.from(
                        session,
                        soloSymbolStatisticRepository.findBySoloSessionIdOrderBySymbol(session.getId()),
                        0))
                .toList();
    }

    int rewardFor(long playDurationMs) {
        if (playDurationMs <= FAST_LIMIT_MS) {
            return policy.getSoloFastExp();
        }
        if (playDurationMs <= MEDIUM_LIMIT_MS) {
            return policy.getSoloMediumExp();
        }
        if (playDurationMs <= SLOW_LIMIT_MS) {
            return policy.getSoloSlowExp();
        }
        return 0;
    }

    private void requireOwner(Long ownerId, Long userId) {
        if (!ownerId.equals(userId)) {
            throw new BusinessException(ErrorCode.ACTIVITY_SESSION_ACCESS_DENIED);
        }
    }

    private void validateStatistics(List<SoloSymbolStatisticRequest> statistics) {
        HashSet<String> symbols = new HashSet<>();
        if (statistics.stream().anyMatch(statistic -> !symbols.add(statistic.symbol()))) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
    }

    private boolean sameStatistics(
            List<SoloSymbolStatistic> stored, List<SoloSymbolStatisticRequest> requested) {
        if (stored.size() != requested.size()) {
            return false;
        }
        List<SoloSymbolStatisticRequest> sorted = requested.stream()
                .sorted(Comparator.comparing(SoloSymbolStatisticRequest::symbol))
                .toList();
        for (int index = 0; index < stored.size(); index++) {
            SoloSymbolStatistic actual = stored.get(index);
            SoloSymbolStatisticRequest expected = sorted.get(index);
            if (!actual.getSymbol().equals(expected.symbol())
                    || actual.getCorrectCount() != expected.correctCount()
                    || actual.getIncorrectCount() != expected.incorrectCount()
                    || actual.getConfirmedCount() != expected.confirmedCount()) {
                return false;
            }
        }
        return true;
    }
}
