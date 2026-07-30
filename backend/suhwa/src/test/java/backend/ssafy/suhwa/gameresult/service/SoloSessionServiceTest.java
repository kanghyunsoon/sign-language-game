package backend.ssafy.suhwa.gameresult.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import backend.ssafy.suhwa.common.exception.BusinessException;
import backend.ssafy.suhwa.common.exception.ErrorCode;
import backend.ssafy.suhwa.gameresult.domain.GameResult;
import backend.ssafy.suhwa.gameresult.domain.SoloPlayMode;
import backend.ssafy.suhwa.gameresult.domain.SoloSession;
import backend.ssafy.suhwa.gameresult.dto.CompleteSoloSessionRequest;
import backend.ssafy.suhwa.gameresult.dto.SoloGameResult;
import backend.ssafy.suhwa.gameresult.repository.GameResultRepository;
import backend.ssafy.suhwa.gameresult.repository.SoloSessionRepository;
import backend.ssafy.suhwa.gameresult.repository.SoloSessionSymbolRepository;
import backend.ssafy.suhwa.gameresult.repository.SoloSymbolStatisticRepository;
import backend.ssafy.suhwa.growth.config.GrowthPolicyProperties;
import backend.ssafy.suhwa.growth.domain.UserPet;
import backend.ssafy.suhwa.growth.service.GrowthRewardService;
import backend.ssafy.suhwa.user.service.UserService;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

class SoloSessionServiceTest {

    private SoloSessionRepository sessionRepository;
    private SoloSymbolStatisticRepository statisticRepository;
    private GameResultRepository gameResultRepository;
    private GrowthRewardService growthRewardService;
    private SoloSessionService service;
    private UserPet pet;

    @BeforeEach
    void setUp() {
        sessionRepository = Mockito.mock(SoloSessionRepository.class);
        statisticRepository = Mockito.mock(SoloSymbolStatisticRepository.class);
        gameResultRepository = Mockito.mock(GameResultRepository.class);
        growthRewardService = Mockito.mock(GrowthRewardService.class);
        service = new SoloSessionService(
                sessionRepository,
                Mockito.mock(SoloSessionSymbolRepository.class),
                statisticRepository,
                gameResultRepository,
                growthRewardService,
                new GrowthPolicyProperties(),
                Clock.fixed(Instant.parse("2026-07-30T03:00:00Z"), ZoneOffset.UTC),
                Mockito.mock(UserService.class));
        pet = UserPet.builder().userId(1L).build();
        given(growthRewardService.lockPet(1L)).willReturn(pet);
        given(statisticRepository.findBySoloSessionIdOrderBySymbol("session-1"))
                .willReturn(List.of());
        given(gameResultRepository.save(any(GameResult.class)))
                .willAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void rewardBoundariesIncludeNinetyHundredFiveAndHundredTwentySeconds() {
        assertThat(service.rewardFor(90_000)).isEqualTo(15);
        assertThat(service.rewardFor(90_001)).isEqualTo(10);
        assertThat(service.rewardFor(105_000)).isEqualTo(10);
        assertThat(service.rewardFor(105_001)).isEqualTo(5);
        assertThat(service.rewardFor(120_000)).isEqualTo(5);
        assertThat(service.rewardFor(120_001)).isZero();
    }

    @Test
    void firstCompletionStoresResultAndRewardsOnce() {
        SoloSession session = newSession(1L);
        given(sessionRepository.findByIdForUpdate("session-1")).willReturn(Optional.of(session));
        CompleteSoloSessionRequest request = request(90_000, 100);

        SoloGameResult result = service.complete(1L, "session-1", request);

        assertThat(result.awardedExp()).isEqualTo(15);
        verify(growthRewardService).rewardLocked(pet, 15);
        verify(gameResultRepository).save(any(GameResult.class));
    }

    @Test
    void samePayloadReplayDoesNotRewardOrSaveAgain() {
        SoloSession session = newSession(1L);
        session.complete(
                100, 2, 3, 90_000, Instant.ofEpochMilli(1_000), Instant.now());
        given(sessionRepository.findByIdForUpdate("session-1")).willReturn(Optional.of(session));

        SoloGameResult result = service.complete(1L, "session-1", request(90_000, 100));

        assertThat(result.awardedExp()).isZero();
        verify(growthRewardService, never()).lockPet(1L);
        verify(gameResultRepository, never()).save(any());
    }

    @Test
    void differentPayloadReplayReturnsConflict() {
        SoloSession session = newSession(1L);
        session.complete(
                100, 2, 3, 90_000, Instant.ofEpochMilli(1_000), Instant.now());
        given(sessionRepository.findByIdForUpdate("session-1")).willReturn(Optional.of(session));

        assertThatThrownBy(() -> service.complete(1L, "session-1", request(90_000, 101)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(ErrorCode.ACTIVITY_COMPLETION_CONFLICT.name()));
    }

    @Test
    void anotherUsersSessionIsForbidden() {
        given(sessionRepository.findByIdForUpdate("session-1"))
                .willReturn(Optional.of(newSession(2L)));

        assertThatThrownBy(() -> service.complete(1L, "session-1", request(90_000, 100)))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getCode())
                                .isEqualTo(ErrorCode.ACTIVITY_SESSION_ACCESS_DENIED.name()));
    }

    private SoloSession newSession(Long userId) {
        return SoloSession.builder()
                .id("session-1")
                .userId(userId)
                .difficulty("NORMAL")
                .playMode(SoloPlayMode.KEYBOARD)
                .startedAt(Instant.ofEpochMilli(500))
                .build();
    }

    private CompleteSoloSessionRequest request(long duration, int score) {
        return new CompleteSoloSessionRequest(score, 2, 3, duration, List.of(), 1_000);
    }
}
